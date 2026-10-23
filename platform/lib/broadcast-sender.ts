import { Resend } from 'resend'
import { prisma } from './prisma'
import {
  BroadcastRecipient,
  BroadcastTemplate,
  broadcastContext,
  buildRecipientEmail,
  recipientVariables,
  trackingPixelUrl,
} from './broadcast'
import { renderTemplate } from './messaging'
import { OpenWaProvider, openWaConfig } from './messaging/openwa'

/** A recipient with the log row that will hold their message. */
export interface QueuedRecipient {
  recipient: BroadcastRecipient
  logId: string
  paymentLink: string | null
}

/** How long one request may spend sending before the platform would cut it off. */
export const DEFAULT_SEND_DEADLINE_MS = 40_000

const resendClient = () => {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}

// A public support address: never the admin login email, which would make the
// admin account a target.
const fromAddress = () => process.env.RESEND_FROM || 'ToroPay <onboarding@resend.dev>'
const replyToAddress = () => process.env.RESEND_REPLY_TO || process.env.SUPPORT_EMAIL || 'support@toropay.co.in'

/** Whether an email can be sent at all, and why not when it cannot. */
export function emailProviderProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.RESEND_API_KEY) return 'Email sending is not set up yet. Add RESEND_API_KEY and redeploy.'
  return null
}

/** Whether a WhatsApp broadcast can be sent at all, and why not when it cannot. */
export function whatsappProviderProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!openWaConfig(env)) {
    return 'WhatsApp sending is not set up yet. Add OPENWA_URL, OPENWA_API_KEY and OPENWA_SESSION_ID and redeploy.'
  }
  return null
}

/** The channel a campaign is sent on, defaulting to email for older rows. */
function channelOf(channel: string | undefined): string {
  return channel === 'whatsapp' ? 'whatsapp' : 'email'
}

/**
 * Writes a log row for every recipient, so a request that runs out of time
 * never leaves a recipient without a record. Rows that already exist are
 * left alone, so calling this again never sends the same message twice.
 */
export async function createPendingLogs(
  recipients: BroadcastRecipient[],
  options: { campaignId: string; createdBy: string; subject: string; channel?: string }
): Promise<number> {
  const channel = channelOf(options.channel)
  const CHUNK = 500
  let created = 0
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK)
    const result = await prisma.messageLog.createMany({
      data: chunk.map(recipient => ({
        merchantId: recipient.id,
        campaignId: options.campaignId,
        channel,
        // A WhatsApp message is addressed to the merchant's phone; email to
        // their address. The row records whichever was actually used.
        recipient: channel === 'whatsapp' ? (recipient.phone ?? '') : recipient.email,
        subject: channel === 'whatsapp' ? '' : options.subject,
        renderedBody: '',
        status: 'pending',
        provider: channel === 'whatsapp' ? 'openwa' : 'resend',
        createdBy: options.createdBy,
        // One row per recipient per campaign, so a resumed send never doubles up.
        idempotencyKey: `${options.campaignId}:${recipient.id}`,
      })),
      skipDuplicates: true,
    })
    created += result.count
  }
  return created
}

/**
 * Sends the queued messages, stopping before the deadline so the rest are
 * still pending and can be sent by a later call.
 */
export async function deliverQueuedRecipients(
  queued: QueuedRecipient[],
  template: BroadcastTemplate,
  options: { deadline?: number; feedbackFormLink?: string | null; channel?: string } = {}
): Promise<{ sent: number; failed: number; remaining: number }> {
  const context = broadcastContext()
  const deadline = options.deadline ?? Date.now() + DEFAULT_SEND_DEADLINE_MS
  const channel = channelOf(options.channel)
  let sent = 0
  let failed = 0

  for (let i = 0; i < queued.length; i += 1) {
    if (Date.now() >= deadline) {
      return { sent, failed, remaining: queued.length - i }
    }

    const entry = queued[i]

    let status = 'sent'
    let providerMessageId: string | null = null
    let errorMessage: string | null = null
    let renderedSubject = ''
    let renderedBody = ''

    if (channel === 'whatsapp') {
      // A WhatsApp message is plain text: the same template as the email body,
      // with each recipient's own values filled in. There is no subject line
      // or button, so neither is rendered.
      renderedBody = renderTemplate(
        template.body,
        recipientVariables(entry.recipient, context, {
          paymentLink: entry.paymentLink,
          feedbackFormLink: options.feedbackFormLink,
        })
      )
      try {
        const config = openWaConfig()
        if (!config) throw new Error('WhatsApp sending is not set up')
        const provider = new OpenWaProvider(config)
        const result = await provider.sendMessage({
          to: entry.recipient.phone ?? '',
          body: renderedBody,
          metadata: { idempotencyKey: entry.logId },
        })
        if (!result.ok) {
          status = 'failed'
          errorMessage = result.error ?? 'WhatsApp send failed'
        } else {
          providerMessageId = result.providerMessageId
        }
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : 'Failed to send WhatsApp message'
      }
    } else {
      const email = buildRecipientEmail(entry.recipient, template, context, {
        paymentLink: entry.paymentLink,
        feedbackFormLink: options.feedbackFormLink,
        trackingPixelUrl: trackingPixelUrl(entry.logId, context.appUrl),
      })
      renderedSubject = email.subject
      renderedBody = email.body

      try {
        const resend = resendClient()
        if (!resend) {
          throw new Error('Email sending is not set up')
        }
        const result = await resend.emails.send({
          from: fromAddress(),
          to: entry.recipient.email,
          replyTo: replyToAddress(),
          subject: email.subject,
          html: email.html,
          text: email.body,
        })
        // Resend reports a refused send in the result rather than by throwing.
        if (result.error) {
          status = 'failed'
          errorMessage = result.error.message
        } else {
          providerMessageId = result.data?.id || null
        }
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : 'Failed to send email'
      }
    }

    await prisma.messageLog.update({
      where: { id: entry.logId },
      data: {
        subject: renderedSubject,
        renderedBody,
        status,
        provider: channel === 'whatsapp' ? 'openwa' : 'resend',
        providerMessageId,
        errorMessage,
        sentAt: status === 'sent' ? new Date() : null,
      },
    })

    if (status === 'sent') sent += 1
    else failed += 1
  }

  return { sent, failed, remaining: 0 }
}
