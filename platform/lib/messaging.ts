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

export function getUsedVariables(template: string): string[] {
  const vars: string[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(VARIABLE_REGEX.source, 'g')
  while ((match = regex.exec(template)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1])
  }
  return vars
}

export function validateTemplate(template: string): { valid: boolean; missingVars: string[]; usedVars: string[] } {
  const usedVars = getUsedVariables(template)
  const unsupported = usedVars.filter(v => !(SUPPORTED_VARIABLES as readonly string[]).includes(v))
  return {
    valid: unsupported.length === 0,
    missingVars: unsupported,
    usedVars,
  }
}
