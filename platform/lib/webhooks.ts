import crypto from 'crypto'
import { prisma } from './prisma'
import { postWebhook, UnsafeWebhookUrlError } from './safe-fetch'
import { nextWebhookAttemptAt, retryWindowStart } from './webhook-retry'

export function signWebhookPayload(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * The merchant's webhook signing secret. Created on first use, so every webhook
 * is signed even when the merchant never set one.
 */
async function getWebhookSecret(merchantId: string, current: string | null | undefined): Promise<string> {
  if (current) return current
  const generated = `whsec_${crypto.randomBytes(24).toString('hex')}`
  await prisma.merchantSettings.upsert({ where: { merchantId }, create: { merchantId }, update: {} })
  // Only fills an empty secret, so concurrent deliveries settle on one value.
  await prisma.merchantSettings.updateMany({ where: { merchantId, webhookSecret: null }, data: { webhookSecret: generated } })
  const settings = await prisma.merchantSettings.findUnique({ where: { merchantId } })
  return settings?.webhookSecret || generated
}

/** Sends a logged webhook body once and records the outcome, scheduling the next retry on failure. */
async function sendWebhookLog(
  log: { id: string; url: string; payload: string; retryCount: number },
  secret: string,
  eventId: string
) {
  const failedAttempts = log.retryCount + 1
  try {
    const res = await postWebhook(log.url, {
      headers: {
        'Content-Type': 'application/json',
        'X-ToroPay-Signature': signWebhookPayload(log.payload, secret),
        'X-ToroPay-Event-Id': eventId,
      },
      body: log.payload,
    })
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        status: res.ok ? 'delivered' : 'failed',
        responseCode: res.status,
        responseBody: res.body,
        deliveredAt: res.ok ? new Date() : null,
        retryCount: res.ok ? log.retryCount : failedAttempts,
        nextRetryAt: res.ok ? null : nextWebhookAttemptAt(failedAttempts),
      },
    })
  } catch (err: unknown) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        responseBody: err instanceof Error ? err.message : 'Delivery failed',
        retryCount: failedAttempts,
        // A private or invalid address will never work, so it isn't retried.
        nextRetryAt: err instanceof UnsafeWebhookUrlError ? null : nextWebhookAttemptAt(failedAttempts),
      },
    })
  }
}

export async function deliverMerchantWebhook(opts: {
  merchantId: string
  transactionId: string
  url: string
  event: string
  payload: Record<string, unknown>
  secret: string
}) {
  const eventId = `evt_${crypto.randomBytes(12).toString('hex')}`
  const body = JSON.stringify({
    event: opts.event,
    event_id: eventId,
    ...opts.payload,
    timestamp: new Date().toISOString(),
  })

  const log = await prisma.webhookLog.create({
    data: {
      merchantId: opts.merchantId,
      transactionId: opts.transactionId,
      url: opts.url,
      payload: body,
      status: 'pending',
    },
  })

  await sendWebhookLog({ id: log.id, url: opts.url, payload: body, retryCount: 0 }, opts.secret, eventId)
}

/**
 * Re-sends failed payment-link webhooks whose retry time has come, with the
 * same body and event ID. Run by /api/cron/webhook-retries. Returns how many
 * were attempted.
 */
export async function retryDueWebhookLogs({ deadline = Infinity, limit = 25 } = {}): Promise<number> {
  const due = await prisma.webhookLog.findMany({
    where: { status: 'failed', nextRetryAt: { lte: new Date(), gte: retryWindowStart() } },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  })

  let attempted = 0
  for (const log of due) {
    if (Date.now() > deadline) break

    // Claim it by pushing the retry time out, so an overlapping run skips it.
    const claimed = await prisma.webhookLog.updateMany({
      where: { id: log.id, status: 'failed', nextRetryAt: log.nextRetryAt },
      data: { nextRetryAt: new Date(Date.now() + 10 * 60_000) },
    })
    if (claimed.count !== 1) continue

    let payload: { status?: string; event_id?: string } = {}
    try {
      payload = JSON.parse(log.payload)
    } catch {
      // Sent as stored; the event ID header is just left empty.
    }

    // If the payment has moved on (say pending → success), this older event
    // would make the merchant's site go backwards, so it is dropped.
    if (log.transactionId && payload.status) {
      const txn = await prisma.transaction.findUnique({ where: { id: log.transactionId }, select: { status: true } })
      if (txn && txn.status !== payload.status) {
        await prisma.webhookLog.update({ where: { id: log.id }, data: { status: 'superseded', nextRetryAt: null } })
        continue
      }
    }

    const settings = await prisma.merchantSettings.findUnique({ where: { merchantId: log.merchantId } })
    const secret = await getWebhookSecret(log.merchantId, settings?.webhookSecret)
    await sendWebhookLog(log, secret, payload.event_id ?? '')
    attempted += 1
  }
  return attempted
}

export async function notifyPaymentStatus(transactionId: string, status: 'success' | 'failed' | 'pending') {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      paymentLink: { select: { webhookUrl: true, title: true } },
      merchant: { include: { settings: true } },
    },
  })
  if (!txn?.paymentLink?.webhookUrl) return

  await deliverMerchantWebhook({
    merchantId: txn.merchantId,
    transactionId: txn.id,
    url: txn.paymentLink.webhookUrl,
    event: `payment.${status}`,
    secret: await getWebhookSecret(txn.merchantId, txn.merchant.settings?.webhookSecret),
    payload: {
      txn_id: txn.txnId,
      amount: txn.amount,
      status,
      customer_name: txn.customerName,
      customer_phone: txn.customerPhone,
      customer_email: txn.customerEmail,
      payment_app: txn.paymentApp,
      link_title: txn.paymentLink.title,
    },
  })
}
