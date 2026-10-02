export type MessagingChannel = 'email' | 'whatsapp' | 'instagram'

export type MessageEventCategory = 'transactional' | 'promotional'

export interface MessageEventDefinition {
  label: string
  category: MessageEventCategory
  description: string
}

/**
 * Supported message triggers. `transactional` messages are always allowed
 * (consent only gates `promotional` sends).
 */
export const MESSAGE_EVENTS: Record<string, MessageEventDefinition> = {
  payment_received: {
    label: 'Payment received',
    category: 'transactional',
    description: 'Sent when a customer payment is confirmed.',
  },
  payment_reminder: {
    label: 'Payment pending reminder',
    category: 'transactional',
    description: 'Reminder that a payment link is still pending.',
  },
  order_confirmed: {
    label: 'Order confirmed',
    category: 'transactional',
    description: 'Sent when an order is confirmed after payment.',
  },
  order_packed: {
    label: 'Order packed',
    category: 'transactional',
    description: 'Sent when an order is packed and ready.',
  },
  shipment_created: {
    label: 'Shipment created',
    category: 'transactional',
    description: 'Sent when a package gets a tracking number.',
  },
  shipment_in_transit: {
    label: 'Shipment in transit',
    category: 'transactional',
    description: 'Sent when a package is moving in the network.',
  },
  shipment_out_for_delivery: {
    label: 'Out for delivery',
    category: 'transactional',
    description: 'Sent when a package is out for delivery.',
  },
  shipment_delivered: {
    label: 'Delivered',
    category: 'transactional',
    description: 'Sent when a package is delivered.',
  },
  shipment_delivery_failed: {
    label: 'Delivery failed',
    category: 'transactional',
    description: 'Sent when a delivery attempt failed.',
  },
  return_requested: {
    label: 'Return requested',
    category: 'transactional',
    description: 'Return request received acknowledgement.',
  },
  return_approved: {
    label: 'Return approved',
    category: 'transactional',
    description: 'Sent when a return request is approved.',
  },
  return_received: {
    label: 'Return received',
    category: 'transactional',
    description: 'Sent when returned items reach the merchant.',
  },
  refund_initiated: {
    label: 'Refund initiated',
    category: 'transactional',
    description: 'Sent when a refund is started at the payment provider.',
  },
  refund_completed: {
    label: 'Refund completed',
    category: 'transactional',
    description: 'Sent when a refund is completed by the payment provider.',
  },
  manual_message: {
    label: 'Manual merchant message',
    category: 'transactional',
    description: 'Ad-hoc message sent from the dashboard.',
  },
  customer_follow_up: {
    label: 'Customer follow-up',
    category: 'promotional',
    description: 'Promotional follow-up such as a review request or re-engagement message.',
  },
  repeat_customer_offer: {
    label: 'Repeat customer offer',
    category: 'promotional',
    description: 'Offer / win-back message to a repeat customer. Requires marketing consent.',
  },
}

export const SUPPORTED_MESSAGE_VARIABLES = [
  'customer_name',
  'business_name',
  'order_number',
  'order_id',
  'product_list',
  'product_name',
  'amount',
  'currency',
  'courier_name',
  'tracking_number',
  'tracking_link',
  'estimated_delivery_date',
  'support_phone',
  'support_email',
  'payment_link',
  'feedback_form_link',
] as const

export type MessageContext = Record<string, string>

const PROMOTIONAL_EVENTS = new Set<string>(
  Object.entries(MESSAGE_EVENTS)
    .filter(([, def]) => def.category === 'promotional')
    .map(([key]) => key),
)

/** Promotional events require customer marketing consent before sending. */
export function isPromotionalEvent(eventType: string): boolean {
  return PROMOTIONAL_EVENTS.has(eventType)
}

/** Default bodies, keyed by event, put together from the spec's trigger list. */
const EMAIL_SUBJECT: Record<string, string> = {
  payment_received: 'Payment received - {{order_number}} - {{business_name}}',
  payment_reminder: 'Reminder: complete your payment to {{business_name}}',
  order_confirmed: 'Order confirmed - {{order_number}}',
  order_packed: 'Your order {{order_number}} is packed!',
  shipment_created: 'Your order {{order_number}} has shipped',
  shipment_in_transit: 'Your package is on the move - {{order_number}}',
  shipment_out_for_delivery: 'Out for delivery today - {{order_number}}',
  shipment_delivered: 'Delivered - {{order_number}}',
  shipment_delivery_failed: 'We couldn\u2019t deliver {{order_number}} yet',
  return_requested: 'We received your return request - {{order_number}}',
  return_approved: 'Your return was approved - {{order_number}}',
  return_received: 'Return received - {{order_number}}',
  refund_initiated: 'Refund initiated - {{order_number}}',
  refund_completed: 'Refund completed - {{order_number}}',
  manual_message: 'Message from {{business_name}}',
  customer_follow_up: 'Hello from {{business_name}}',
  repeat_customer_offer: 'A special offer for you, {{customer_name}}',
}

const BODY: Record<string, string> = {
  payment_received: `Hi {{customer_name}},

Thank you! Your payment to {{business_name}} was received successfully.

Order: {{order_number}}
Amount: {{currency}} {{amount}}

Products:
{{product_list}}

For support, contact us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  payment_reminder: `Hi {{customer_name}},

You have a pending payment of {{currency}} {{amount}} with {{business_name}}.

Complete your payment here: {{payment_link}}

If you need help, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  order_confirmed: `Hi {{customer_name}},

Great news — your order {{order_number}} with {{business_name}} is confirmed and being processed.

Order: {{order_number}}
Amount: {{currency}} {{amount}}

Products:
{{product_list}}

For support, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  order_packed: `Hi {{customer_name}},

Your order {{order_number}} is packed and waiting for pickup.

Amount: {{currency}} {{amount}}
Products:
{{product_list}}

We'll share tracking details once it ships.

— {{business_name}}`,
  shipment_created: `Hi {{customer_name}},

Great news — a shipment for order {{order_number}} from {{business_name}} is on its way.

Courier: {{courier_name}}
Tracking number: {{tracking_number}}
Track your package here: {{tracking_link}}

Estimated delivery: {{estimated_delivery_date}}

Items:
{{product_list}}

If you need help, contact us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  shipment_in_transit: `Hi {{customer_name}},

Your order {{order_number}} is in transit with {{courier_name}}.

Tracking number: {{tracking_number}}
Track here: {{tracking_link}}

Estimated delivery: {{estimated_delivery_date}}

— {{business_name}}`,
  shipment_out_for_delivery: `Hi {{customer_name}},

Your order {{order_number}} is out for delivery today.

Courier: {{courier_name}}
Tracking number: {{tracking_number}}
Track here: {{tracking_link}}

Please keep your phone handy for delivery.

— {{business_name}}`,
  shipment_delivered: `Hi {{customer_name}},

Your order {{order_number}} has been delivered.

We hope you love it! If anything looks wrong, reach us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  shipment_delivery_failed: `Hi {{customer_name}},

Our courier {{courier_name}} tried to deliver order {{order_number}} but was unable to.

This usually happens when the address or the recipient is unavailable. Want to arrange re-delivery? Contact us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  return_requested: `Hi {{customer_name}},

We received your return request for order {{order_number}} and will review it shortly.

Order: {{order_number}}
Products:
{{product_list}}

For help, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  return_approved: `Hi {{customer_name}},

Good news — your return request for order {{order_number}} with {{business_name}} was approved.

Please share the return tracking number with us at {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  return_received: `Hi {{customer_name}},

We received your returned items for order {{order_number}}.

We'll process the refund once the items are checked.

— {{business_name}}`,
  refund_initiated: `Hi {{customer_name}},

We've initiated a refund of {{currency}} {{amount}} for order {{order_number}}.

It usually reflects within 5-7 business days depending on your bank.

— {{business_name}}`,
  refund_completed: `Hi {{customer_name}},

Your refund of {{currency}} {{amount}} for order {{order_number}} is complete.

Thanks for your patience.

— {{business_name}}`,
  manual_message: `Hi {{customer_name}},

{{custom_note}}

— {{business_name}}
Contact: {{support_email}} / {{support_phone}}`,
  customer_follow_up: `Hi {{customer_name}},

{{custom_note}}

We'd love to hear your feedback about your recent order {{order_number}}.

For help, contact {{support_email}} or {{support_phone}}.

— {{business_name}}`,
  repeat_customer_offer: `Hi {{customer_name}},

As a valued customer, here's a special offer from {{business_name}} just for you.

{{custom_note}}

Shop again with us — contact {{support_email}} or {{support_phone}} if you have questions.

— {{business_name}}`,
}

const CHAT_FOOTER = '\n\nReply STOP to opt out of promotional messages.'

function chatBody(eventType: string): string {
  const base = BODY[eventType]
  return isPromotionalEvent(eventType) ? `${base}${CHAT_FOOTER}` : base
}

export function defaultMessageBody(channel: string, eventType: string): string {
  if (channel === 'email') return BODY[eventType] ?? BODY.manual_message
  return chatBody(eventType)
}

export function defaultMessageSubject(channel: string, eventType: string): string {
  if (channel !== 'email') return ''
  return EMAIL_SUBJECT[eventType] ?? ''
}

/** Build a full message context from available parts. Every variable gets a value. */
export function buildMessageContext(base: MessageContext, overrides: Partial<MessageContext> = {}): MessageContext {
  const ctx: MessageContext = {
    customer_name: 'Customer',
    business_name: 'ToroPay business',
    order_number: '-',
    order_id: '-',
    product_list: '-',
    product_name: '-',
    amount: '0.00',
    currency: 'INR',
    courier_name: '-',
    tracking_number: '-',
    tracking_link: '',
    estimated_delivery_date: '-',
    support_phone: '',
    support_email: '',
    payment_link: '',
    feedback_form_link: '',
    custom_note: '',
    ...(base || {}),
    ...(overrides || {}),
  }
  return ctx
}

/** Email automation keys that the legacy email system already dispatches. */
export const MESSAGE_EVENT_TO_EMAIL_KEY: Record<string, string> = {
  payment_received: 'payment_received',
  payment_reminder: 'payment_link_reminder',
  order_confirmed: 'order_confirmed',
  shipment_created: 'shipment_created',
  shipment_in_transit: 'shipment_in_transit',
  shipment_out_for_delivery: 'shipment_out_for_delivery',
  shipment_delivered: 'shipment_delivered',
  shipment_delivery_failed: 'shipment_delivery_failed',
}