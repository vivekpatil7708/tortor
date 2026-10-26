/**
 * The outgoing webhook event catalogue. Kept free of server imports so the
 * dashboard can show the same names and descriptions the API emits.
 */
export const WEBHOOK_EVENTS = [
  {
    value: 'order.created',
    label: 'Order created',
    description: 'A checkout or order was created.',
  },
  {
    value: 'order.paid',
    label: 'Order paid',
    description: 'An order payment was confirmed.',
  },
  {
    value: 'order.updated',
    label: 'Order updated',
    description: 'An order status changed.',
  },
  {
    value: 'payment.confirmed',
    label: 'Payment confirmed',
    description: 'A payment was confirmed, from an order checkout or a payment link.',
  },
  {
    value: 'payment.rejected',
    label: 'Payment rejected',
    description: 'A payment was rejected or failed.',
  },
  {
    value: 'payment.paid',
    label: 'Payment paid (legacy)',
    description: 'An order payment was paid. Kept for existing integrations.',
  },
  {
    value: 'payment.failed',
    label: 'Payment failed (legacy)',
    description: 'An order payment failed. Kept for existing integrations.',
  },
  {
    value: 'payment_link.created',
    label: 'Payment link created',
    description: 'A payment link was created.',
  },
  {
    value: 'customer.created',
    label: 'Customer created',
    description: 'A customer record was created.',
  },
  {
    value: 'fulfillment.created',
    label: 'Fulfillment created',
    description: 'A fulfillment was created for an order.',
  },
  {
    value: 'fulfillment.shipped',
    label: 'Fulfillment shipped',
    description: 'A shipment left the merchant.',
  },
  {
    value: 'fulfillment.delivered',
    label: 'Fulfillment delivered',
    description: 'A shipment was marked delivered.',
  },
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]['value']

export const OUTGOING_WEBHOOK_EVENTS: readonly WebhookEvent[] = WEBHOOK_EVENTS.map(event => event.value)

export const WEBHOOK_EVENT_LABELS: Record<string, string> = Object.fromEntries(
  WEBHOOK_EVENTS.map(event => [event.value, event.label]),
)

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === 'string' && OUTGOING_WEBHOOK_EVENTS.includes(value as WebhookEvent)
}
