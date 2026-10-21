import { renderBroadcastEmail } from './email'
import { renderTemplate } from './messaging'

/** A merchant a broadcast can go to. */
export interface BroadcastRecipient {
  id: string
  email: string
  businessName: string
  phone: string | null
}

/** The text of a broadcast, before the variables are filled in. */
export interface BroadcastTemplate {
  subject: string
  body: string
  ctaLabel?: string
}

/** Where a broadcast points, and what the button says when it does. */
export interface BroadcastContext {
  appUrl: string
  supportEmail: string
}

export const DEFAULT_CTA_LABEL = 'Share Your Feedback'

/** The settings the broadcasts are sent with, read from the environment. */
export function broadcastContext(env: NodeJS.ProcessEnv = process.env): BroadcastContext {
  return {
    appUrl: env.NEXT_PUBLIC_APP_URL || 'https://www.toropay.co.in',
    supportEmail: env.SUPPORT_EMAIL || 'support@toropay.co.in',
  }
}

/** The pixel that records that an email was opened. */
export function trackingPixelUrl(messageLogId: string, appUrl: string): string {
  return `${appUrl}/api/admin/email/open/${messageLogId}`
}

/**
 * The values one recipient sees in a broadcast. Every merchant gets their own
 * name and payment link, so these are per recipient and not per campaign.
 */
export function recipientVariables(
  recipient: BroadcastRecipient,
  context: BroadcastContext,
  options: { paymentLink?: string | null; feedbackFormLink?: string | null } = {}
): Record<string, string> {
  return {
    merchant_name: recipient.businessName || recipient.email || 'Merchant',
    payment_link: options.paymentLink || context.appUrl,
    feedback_form_link: options.feedbackFormLink || `${context.appUrl}/feedback`,
    support_email: context.supportEmail,
    support_phone: recipient.phone || '',
    currency: 'INR',
  }
}

/**
 * The subject, body and HTML of one recipient's email. The template is filled
 * in once, so the same rendered text is used for the subject line, the HTML
 * and the plain-text part, and a placeholder can never be left in one of them
 * but not the others.
 */
export function buildRecipientEmail(
  recipient: BroadcastRecipient,
  template: BroadcastTemplate,
  context: BroadcastContext,
  options: { paymentLink?: string | null; feedbackFormLink?: string | null; trackingPixelUrl?: string } = {}
): { subject: string; body: string; html: string } {
  const variables = recipientVariables(recipient, context, options)
  const subject = renderTemplate(template.subject, variables)
  const body = renderTemplate(template.body, variables)
  const html = renderBroadcastEmail({
    subject,
    body,
    ctaUrl: variables.feedback_form_link,
    ctaLabel: template.ctaLabel || DEFAULT_CTA_LABEL,
    trackingPixelUrl: options.trackingPixelUrl,
  })
  return { subject, body, html }
}
