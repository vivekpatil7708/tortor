import { prisma } from './prisma'
import { Audience, audienceOf, audienceWhere, parseAudience, transactionCountFilter } from './broadcast-audience'
import { BroadcastRecipient, broadcastContext } from './broadcast'
import {
  DEFAULT_SEND_DEADLINE_MS,
  QueuedRecipient,
  createPendingLogs,
  deliverQueuedRecipients,
} from './broadcast-sender'

export const CAMPAIGN_STATUSES = ['draft', 'sending', 'sent', 'failed'] as const
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number]

/** The most merchants one campaign can go to. */
export const MAX_CAMPAIGN_RECIPIENTS = 5000

/** The most messages one request sends before it stops and leaves the rest pending. */
export const MAX_SENDS_PER_REQUEST = 250

export interface CampaignDispatchResult {
  campaignId: string
  /** Recipients the campaign goes to. */
  total: number
  sent: number
  failed: number
  /** Recipients still waiting, because the deadline was reached. */
  remaining: number
  /** Recipients skipped because their address is on the suppression list. */
  suppressed: number
}

/** The feedback link a campaign's recipients are sent, so their answers can be traced back. */
export function campaignFeedbackLink(campaignId: string, appUrl = broadcastContext().appUrl): string {
  return `${appUrl}/feedback?campaign=${campaignId}`
}

/**
 * The merchants with a given number of payments. Prisma cannot filter a
 * relation by how many rows it has, so this part of the audience is worked
 * out by the database itself.
 */
export async function merchantIdsByTransactionCount(range: { min?: number; max?: number }): Promise<string[]> {
  const min = range.min ?? 0
  const max = range.max ?? Number.MAX_SAFE_INTEGER
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT m.id AS id
    FROM merchants m
    LEFT JOIN transactions t ON t.merchant_id = m.id
    GROUP BY m.id
    HAVING COUNT(t.id) >= ${min} AND COUNT(t.id) <= ${max}
  `
  return rows.map(row => row.id)
}

/**
 * The merchants an audience matches, and the payment link each of them gets in
 * the email. Addresses on the suppression list are left out, so a merchant
 * who bounced or complained is not emailed again.
 *
 * `matched` and `suppressed` are the real numbers for the whole audience.
 * `recipients` is the list itself, which `max` can limit when only a sample
 * is needed.
 */
export async function resolveRecipients(
  audience: Audience,
  options: { max?: number; channel?: string; directRecipients?: Array<{ value: string; label: string }> } = {}
): Promise<{
  recipients: BroadcastRecipient[]
  paymentLinks: Map<string, string>
  matched: number
  suppressed: number
  tooMany: boolean
}> {
  const channel = options.channel ?? 'email'
  let where = audienceWhere(audience)

  // A WhatsApp broadcast can only reach a merchant that has a phone number on
  // file, so the audience is narrowed down to those merchants rather than
  // counting recipients that could never be messaged.
  if (channel === 'whatsapp') {
    where = { AND: [where, { phone: { not: null } }, { phone: { not: '' } }] }
  }

  const countFilter = transactionCountFilter(audience)
  if (countFilter) {
    const ids = await merchantIdsByTransactionCount(countFilter)
    where = { AND: [where, { id: { in: ids } }] }
  }

  const merchants = await prisma.merchant.findMany({
    where,
    select: { id: true, email: true, businessName: true, phone: true },
    orderBy: { createdAt: 'asc' },
  })

  const matched = merchants.length + (options.directRecipients?.length ?? 0)
  const tooMany = matched > MAX_CAMPAIGN_RECIPIENTS
  const take = Math.min(options.max ?? MAX_CAMPAIGN_RECIPIENTS, MAX_CAMPAIGN_RECIPIENTS)

  // Suppression is an email concept (bounces and complaints). A WhatsApp
  // broadcast is not filtered by it.
  let recipients: BroadcastRecipient[] = []
  if (channel !== 'email') {
    recipients = merchants.slice(0, take)
  } else {
    const suppressions = await prisma.emailSuppression.findMany({ select: { email: true } })
    const suppressedEmails = suppressions.map(s => s.email.toLowerCase())
    const suppressedSet = new Set(suppressedEmails)
    recipients = merchants.filter(m => !suppressedSet.has(m.email.toLowerCase())).slice(0, take)
  }

  // Add direct recipients
  if (options.directRecipients && options.directRecipients.length > 0) {
    const existingEmails = new Set(recipients.map(r => r.email.toLowerCase()))
    const existingPhones = new Set(recipients.map(r => (r.phone || '').replace(/\D/g, '')))
    for (const dr of options.directRecipients) {
      if (channel === 'email') {
        const email = dr.value.toLowerCase()
        if (existingEmails.has(email)) continue
        existingEmails.add(email)
        recipients.push({
          id: `direct:${email}`,
          email,
          businessName: dr.label || email,
          phone: null,
        })
      } else {
        const digits = dr.value.replace(/\D/g, '')
        if (existingPhones.has(digits)) continue
        existingPhones.add(digits)
        recipients.push({
          id: `direct:${digits}`,
          email: dr.label || `${digits}@direct.toropay`,
          businessName: dr.label || dr.value,
          phone: dr.value,
        })
      }
      if (recipients.length >= take && options.max) break
    }
  }

  const suppressed = channel === 'email' ? (merchants.length - recipients.filter(r => !r.id.startsWith('direct:')).length) : 0

  return { recipients, paymentLinks: await paymentLinksFor(recipients.filter(r => !r.id.startsWith('direct:'))), matched, suppressed, tooMany }
}

/** The first active payment link of each merchant, as an absolute URL. */
async function paymentLinksFor(merchants: BroadcastRecipient[]): Promise<Map<string, string>> {
  const links = await prisma.paymentLink.findMany({
    where: { merchantId: { in: merchants.map(m => m.id) }, status: 'active' },
    select: { merchantId: true, slug: true },
    orderBy: { createdAt: 'asc' },
  })
  const appUrl = broadcastContext().appUrl
  const paymentLinks = new Map<string, string>()
  for (const link of links) {
    if (!paymentLinks.has(link.merchantId)) paymentLinks.set(link.merchantId, `${appUrl}/pay/${link.slug}`)
  }
  return paymentLinks
}

/** The merchants a saved campaign goes to. */
export async function resolveCampaignRecipients(campaignId: string) {
  const campaign = await prisma.broadcastCampaign.findUnique({
    where: { id: campaignId },
    select: { audience: true, channel: true },
  })
  if (!campaign) {
    return { recipients: [], paymentLinks: new Map(), matched: 0, suppressed: 0, tooMany: false }
  }
  return resolveRecipients(audienceOf(campaign), { channel: campaign.channel })
}

/**
 * Sends a campaign to its recipients.
 *
 * Every recipient gets a log row before anything is sent, and the send stops
 * before the request would time out. Whatever is left is still pending, so
 * calling this again picks up where it stopped and no recipient is emailed
 * twice.
 */
export async function dispatchCampaign(
  campaignId: string,
  options: { deadline?: number } = {}
): Promise<CampaignDispatchResult> {
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')

  const parsed = parseAudience(campaign.audience)
  if (!parsed.ok) throw new Error(parsed.error)

  const { recipients, paymentLinks, matched, suppressed, tooMany } = await resolveRecipients(parsed.audience, {
    channel: campaign.channel,
  })
  if (tooMany) {
    throw new Error(`This audience matches more than ${MAX_CAMPAIGN_RECIPIENTS} merchants. Narrow it down first.`)
  }

  // Filter out direct recipients without proper contact info
  const validRecipients = recipients.filter(r => {
    if (r.id.startsWith('direct:')) {
      if (campaign.channel === 'whatsapp') return r.phone && r.phone.replace(/\D/g, '').length >= 10
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)
    }
    return true
  })
  // A log row for every recipient. Rows that already exist are left alone, so
  // a campaign that is sent again does not email anybody twice.
  await createPendingLogs(validRecipients, {
    campaignId,
    createdBy: campaign.createdBy,
    subject: campaign.subject,
    channel: campaign.channel,
  })

  // The rows still waiting to be sent.
  const pending = await prisma.messageLog.findMany({
    where: { campaignId, status: 'pending' },
    select: { id: true, merchantId: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_SENDS_PER_REQUEST,
  })

  const merchantRows = await prisma.merchant.findMany({
    where: { id: { in: pending.map(row => row.merchantId).filter(id => !id.startsWith('direct:')) } },
    select: { id: true, email: true, businessName: true, phone: true },
  })
  const merchantById = new Map(merchantRows.map(m => [m.id, m]))
  const queued: QueuedRecipient[] = pending
    .map(row => {
      const direct = validRecipients.find(r => r.id === row.merchantId)
      const merchant = direct || merchantById.get(row.merchantId)
      if (!merchant) return null
      return {
        recipient: {
          id: merchant.id,
          email: merchant.email,
          businessName: merchant.businessName,
          phone: merchant.phone,
        },
        logId: row.id,
        paymentLink: paymentLinks.get(merchant.id.startsWith('direct:') ? '' : merchant.id) ?? null,
      }
    })
    .filter((entry): entry is QueuedRecipient => entry !== null)

  await prisma.broadcastCampaign.update({
    where: { id: campaignId },
    data: { status: 'sending', totalCount: validRecipients.length },
  })

  const outcome = await deliverQueuedRecipients(
    queued,
    {
      subject: campaign.subject,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel ?? undefined,
    },
    {
      deadline: options.deadline ?? Date.now() + DEFAULT_SEND_DEADLINE_MS,
      feedbackFormLink: campaignFeedbackLink(campaignId),
      channel: campaign.channel,
    }
  )

  const [sentCount, failedCount, pendingCount] = await Promise.all([
    prisma.messageLog.count({ where: { campaignId, status: 'sent' } }),
    prisma.messageLog.count({ where: { campaignId, status: 'failed' } }),
    prisma.messageLog.count({ where: { campaignId, status: 'pending' } }),
  ])

  await prisma.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      status: pendingCount > 0 ? 'sending' : 'sent',
      sentCount,
      failedCount,
      sentAt: pendingCount > 0 ? null : new Date(),
    },
  })

  return {
    campaignId,
    total: validRecipients.length,
    sent: sentCount,
    failed: failedCount,
    remaining: pendingCount,
    suppressed,
  }
}
