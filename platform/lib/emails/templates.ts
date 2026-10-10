import type { EmailAutomation } from '@prisma/client'

export const EMAIL_AUTOMATION_LABELS: Record<EmailAutomation, string> = {
  payment_received: 'Payment received',
  payment_failed: 'Payment failed',
  order_confirmed: 'Order confirmed',
  payment_link_reminder: 'Payment link reminder',
  merchant_order_created: 'Order created (merchant notification)',
  merchant_payment_received: 'Payment received (merchant notification)',
  shipment_created: 'Shipment created',
  shipment_picked_up: 'Shipment picked up',
  shipment_in_transit: 'Shipment in transit',
  shipment_out_for_delivery: 'Shipment out for delivery',
  shipment_delivered: 'Shipment delivered',
  shipment_delivery_failed: 'Delivery failed',
  shipment_rto_initiated: 'Return / RTO initiated',
}

export const SUPPORTED_EMAIL_VARIABLES = [
  'customer_name',
  'business_name',
  'order_number',
  'amount',
  'currency',
  'product_list',
  'payment_link',
  'support_email',
  'support_phone',
  'tracking_number',
  'awb_number',
  'courier_name',
  'tracking_url',
  'estimated_delivery',
  'event_location',
  'return_tracking_number',
] as const

export interface DefaultTemplate {
  subject: string
  body: string
}

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailAutomation, DefaultTemplate> = {
  payment_received: {
    subject: 'Payment received - {{order_number}} - {{business_name}}',
    body: `Hi {{customer_name}},

Thank you! Your payment to {{business_name}} was received successfully.

Order: {{order_number}}
Amount: {{currency}} {{amount}}

Products:
{{product_list}}

For support, contact us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
  payment_failed: {
    subject: 'Payment failed - {{order_number}}',
    body: `Hi {{customer_name}},

Your payment for order {{order_number}} with {{business_name}} could not be completed.

Order: {{order_number}}
Amount: {{currency}} {{amount}}

You can retry using this link: {{payment_link}}

If you need help, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
  order_confirmed: {
    subject: 'Order confirmed - {{order_number}}',
    body: `Hi {{customer_name}},

Great news — your order {{order_number}} with {{business_name}} is confirmed and being processed.

Order: {{order_number}}
Amount: {{currency}} {{amount}}

Products:
{{product_list}}

For support, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
  payment_link_reminder: {
    subject: 'Reminder: complete your payment to {{business_name}}',
    body: `Hi {{customer_name}},

You have a pending payment of {{currency}} {{amount}} with {{business_name}}.

Complete your payment here: {{payment_link}}

If you need help, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
  merchant_order_created: {
    subject: 'New order - {{order_number}}',
    body: `Hi {{business_name}},

A new order was created on your ToroPay checkout.

Order: {{order_number}}
Amount: {{currency}} {{amount}}
Products:
{{product_list}}

Customer: {{customer_name}}`,
  },
  merchant_payment_received: {
    subject: 'Payment received - {{order_number}}',
    body: `Hi {{business_name}},

You received a payment for order {{order_number}}.

Amount: {{currency}} {{amount}}
Customer: {{customer_name}}

Log in to your ToroPay dashboard to start fulfilment.`,
  },
  shipment_created: {
    subject: 'Your order {{order_number}} has shipped',
    body: `Hi {{customer_name}},

Great news — a shipment for order {{order_number}} from {{business_name}} is on its way.

Courier: {{courier_name}}
Tracking number: {{tracking_number}}
Track your package here: {{tracking_url}}

Estimated delivery: {{estimated_delivery}}

Items:
{{product_list}}

If you need help, contact us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
  shipment_picked_up: {
    subject: 'Shipment picked up - {{order_number}}',
    body: `Hi {{customer_name}},

Your package for order {{order_number}} has been picked up by {{courier_name}} and is heading to our network hub.

Tracking number: {{tracking_number}}
Track here: {{tracking_url}}

— {{business_name}}`,
  },
  shipment_in_transit: {
    subject: 'Your package is on the move - {{order_number}}',
    body: `Hi {{customer_name}},

Your order {{order_number}} is in transit with {{courier_name}}.

Latest location: {{event_location}}
Tracking number: {{tracking_number}}
Track here: {{tracking_url}}

Estimated delivery: {{estimated_delivery}}

— {{business_name}}`,
  },
  shipment_out_for_delivery: {
    subject: 'Out for delivery today - {{order_number}}',
    body: `Hi {{customer_name}},

Your order {{order_number}} is out for delivery today.

Courier: {{courier_name}}
Tracking number: {{tracking_number}}
Track here: {{tracking_url}}

Please keep your phone handy for delivery.

— {{business_name}}`,
  },
  shipment_delivered: {
    subject: 'Delivered - {{order_number}}',
    body: `Hi {{customer_name}},

Your order {{order_number}} has been delivered.

We hope you love it! If anything looks wrong, reach us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
  shipment_delivery_failed: {
    subject: 'We couldn\u2019t deliver {{order_number}} yet',
    body: `Hi {{customer_name}},

Our courier {{courier_name}} tried to deliver order {{order_number}} but was unable to.

{{event_location}}

This usually happens when the address or the recipient is unavailable. The package won't be returned immediately. Want to arrange re-delivery? Contact us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
  shipment_rto_initiated: {
    subject: 'Your order {{order_number}} is returning',
    body: `Hi {{customer_name}},

Unfortunately, order {{order_number}} could not be delivered and is being returned to {{business_name}}.

Return tracking number: {{return_tracking_number}}

We\u2019ll process a refund (if applicable) once the return is received. For help, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  },
}

export function renderEmailTemplate(
  template: string,
  data: Record<string, string>,
  options?: { trackingId?: string; baseUrl?: string }
): string {
  let html = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in data) return data[key]
    return `{{${key}}}`
  })

  if (options?.trackingId && options?.baseUrl) {
    const pixelUrl = `${options.baseUrl}/api/email/open/${options.trackingId}`
    const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;outline:none;text-decoration:none;" />`
    if (html.toLowerCase().includes('</body>')) {
      html = html.replace('</body>', `${pixel}</body>`)
    } else {
      html += pixel
    }
  }

  return html
}

export function buildProductList(products: Array<{ name: string; quantity: number; line_total: number }>): string {
  if (!products.length) return '-'
  return products.map(p => `  • ${p.name} × ${p.quantity} — ₹${p.line_total.toFixed(2)}`).join('\n')
}

export interface EmailContext extends Record<string, string> {
  customer_name: string
  business_name: string
  order_number: string
  amount: string
  currency: string
  product_list: string
  payment_link: string
  support_email: string
  support_phone: string
  tracking_number: string
  awb_number: string
  courier_name: string
  tracking_url: string
  estimated_delivery: string
  event_location: string
  return_tracking_number: string
}

export function sampleEmailContext(overrides: Partial<EmailContext> = {}): EmailContext {
  return {
    customer_name: 'Ravi Sharma',
    business_name: 'My Store',
    order_number: 'TP-2026-1001',
    amount: '1,500.00',
    currency: 'INR',
    product_list: '  • Premium Package × 1 — ₹1,500.00',
    payment_link: 'https://checkout.toropay.co.in/checkout/cs_sample',
    support_email: 'support@mystore.com',
    support_phone: '+91-9876543210',
    tracking_number: 'MOCK20260001ABCDEF',
    awb_number: 'MOCK20260001ABCDEF',
    courier_name: 'Mock Express',
    tracking_url: 'https://mock.courier.toropay.in/track/MOCK20260001ABCDEF',
    estimated_delivery: '3 Oct 2026',
    event_location: 'Bengaluru hub',
    return_tracking_number: 'RMOCK20260001',
    ...overrides,
  }
}