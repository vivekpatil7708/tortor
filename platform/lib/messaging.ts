const VARIABLE_REGEX = /\{\{(\w+)\}\}/g

export const SUPPORTED_VARIABLES = [
  'customer_name',
  'order_id',
  'merchant_name',
  'product_name',
  'order_amount',
  'currency',
  'payment_status',
  'payment_link',
  'delivery_eta',
  'support_email',
  'support_phone',
  'custom_note',
  'feedback_form_link',
] as const

export type TemplateVariable = typeof SUPPORTED_VARIABLES[number]

/**
 * The variables a broadcast to merchants can actually fill in. The customer,
 * order and product variables above only ever exist in a merchant's own
 * messages, so offering them here would send a literal `{{customer_name}}` to
 * every recipient.
 */
export const BROADCAST_VARIABLES = [
  'merchant_name',
  'payment_link',
  'feedback_form_link',
  'support_email',
  'support_phone',
  'currency',
] as const

export type BroadcastVariable = typeof BROADCAST_VARIABLES[number]

export interface SampleData {
  customer_name: string
  order_id: string
  merchant_name: string
  product_name: string
  order_amount: string
  currency: string
  payment_status: string
  payment_link: string
  delivery_eta: string
  support_email: string
  support_phone: string
  custom_note: string
  feedback_form_link: string
}

export const SAMPLE_DATA: SampleData = {
  customer_name: 'Ravi Sharma',
  order_id: 'TXN-12345',
  merchant_name: 'My Store',
  product_name: 'Premium Package',
  order_amount: '1,500.00',
  currency: 'INR',
  payment_status: 'Confirmed',
  payment_link: 'https://www.toropay.co.in/pay/sample-slug',
  delivery_eta: '3-5 business days',
  support_email: 'support@mystore.com',
  support_phone: '+91-9876543210',
  custom_note: 'Handle with care',
  feedback_form_link: 'https://www.toropay.co.in/feedback',
}

export const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  email: {
    subject: 'Order Confirmation - {{order_id}}',
    body: `Hi {{customer_name}},

Your order {{order_id}} with {{merchant_name}} has been confirmed.

Product: {{product_name}}
Amount: {{currency}} {{order_amount}}
Payment status: {{payment_status}}

You can view or complete payment here: {{payment_link}}

For help, contact us at {{support_email}} or {{support_phone}}.

Thank you.`,
  },
  whatsapp: {
    subject: '',
    body: `Hi {{customer_name}}, your order {{order_id}} with {{merchant_name}} is confirmed.
Amount: {{currency}} {{order_amount}}
Payment status: {{payment_status}}
Payment link: {{payment_link}}
Thank you.`,
  },
  instagram: {
    subject: '',
    body: `Hi {{customer_name}}, your order {{order_id}} with {{merchant_name}} is confirmed. Amount: {{currency}} {{order_amount}}. Payment status: {{payment_status}}.`,
  },
}

export const DEFAULT_BROADCAST_TEMPLATE = {
  subject: "We'd love your feedback on ToroPay",
  body: `Hi {{merchant_name}},

Thank you for using ToroPay for your business. We're constantly working to make collecting payments simpler and more reliable for you, and we'd love to hear directly from you about how we're doing.

This short survey takes about two minutes to complete. Your answers will help us improve payment collection, shape upcoming product features, and strengthen the support we provide to merchants like you.

Share Your Feedback: {{feedback_form_link}}

While you're at it, your ToroPay payment page is live and ready to share with customers any time your customers pay online: {{payment_link}}

Thank you for helping us build a better ToroPay.

Warm regards,
The ToroPay Team
ToroPay.co.in`,
}

export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(VARIABLE_REGEX, (_, key) => {
    if (key in data) return data[key]
    return `{{${key}}}`
  })
}

/**
 * Render a message for sending, dropping any line whose only content was a
 * variable we had no value for.
 *
 * A default template ends with `Payment link: {{payment_link}}`. An order with
 * no payment link has no URL to put there, and sending the customer the literal
 * `{{payment_link}}` (or a `Payment link:` label with nothing after it) looks
 * broken. Unfilled placeholders elsewhere are left alone, so this only removes
 * lines that would otherwise be empty or half-empty.
 */
export function renderMessage(template: string, data: Record<string, string>): string {
  const filled = renderTemplate(template, data)

  // A `Label: {{var}}` line whose variable we could not fill would leave just
  // the label behind, reading as a broken message. Such a line, and a line that
  // is nothing but an unfilled placeholder, are both dropped; the decision is
  // made here because the original line is what carries that information.
  const isDroppable = (line: string) =>
    line.includes('{{') &&
    (line.replace(/\s*[A-Za-z ]+:\s*\{\{\w+\}\}\s*$/g, '').trim() === '' ||
      line.replace(VARIABLE_REGEX, '').trim() === '')

  const lines = filled.split('\n')
  const output: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isDroppable(lines[i])) continue
    // A blank line that sat next to a dropped line was only spacing for it, so
    // it goes too; blank lines between content we kept are preserved.
    if (lines[i].trim() === '' && (isDroppable(lines[i - 1]) || isDroppable(lines[i + 1]))) continue
    output.push(lines[i].trimEnd())
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * The wording a send should start from: the merchant's own saved template when
 * they have one for that channel, otherwise our default. A saved template with
 * an empty body is ignored, since that would send a blank message.
 */
export function resolveTemplate(
  channel: string,
  saved: Record<string, { subject: string; body: string }> | null | undefined,
): { subject: string; body: string } {
  const own = saved?.[channel]
  if (own && (own.body.trim() || own.subject.trim())) {
    return { subject: own.subject ?? '', body: own.body ?? '' }
  }
  return DEFAULT_TEMPLATES[channel] || { subject: '', body: '' }
}

/**
 * Turns the `message_templates` rows into a channel-keyed lookup. Rows are one
 * per channel per merchant, so a later row wins if duplicates ever exist.
 */
export function templatesByChannel(
  rows: Array<{ channel: string; subject?: string | null; body?: string | null }>,
): Record<string, { subject: string; body: string }> {
  const byChannel: Record<string, { subject: string; body: string }> = {}
  for (const row of rows) {
    byChannel[row.channel] = { subject: row.subject ?? '', body: row.body ?? '' }
  }
  return byChannel
}

export function getUsedVariables(template: string): string[] {
  const vars: string[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(VARIABLE_REGEX.source, 'g')
  while ((match = regex.exec(template)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1])
  }
  return vars
}

/**
 * The variables a template uses that the given set cannot fill in. A template
 * with any of them would send the placeholder itself to the recipient.
 */
export function unsupportedVariables(
  template: string,
  allowed: readonly string[] = SUPPORTED_VARIABLES
): string[] {
  return getUsedVariables(template).filter(v => !allowed.includes(v))
}

/**
 * Checks a template against the variables that can be filled in. `missingVars`
 * are the ones that would be sent literally.
 */
export function validateTemplate(
  template: string,
  allowed: readonly string[] = SUPPORTED_VARIABLES
): { valid: boolean; missingVars: string[]; usedVars: string[] } {
  const usedVars = getUsedVariables(template)
  const unsupported = unsupportedVariables(template, allowed)
  return {
    valid: unsupported.length === 0,
    missingVars: unsupported,
    usedVars,
  }
}
