export function formatMoney(n: number | null | undefined, currency = 'INR'): string {
  if (n == null) return '—'
  const symbol = currency === 'USD' ? '$' : '₹'
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatShortDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const humanize = (s: string | null | undefined): string => {
  if (!s) return '—'
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export const ORDER_SOURCES: Record<string, string> = {
  manual_order: 'Manual',
  payment_link: 'Payment link',
  website_api: 'Website',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  imported: 'Imported',
  other: 'Other',
}

export const FULFILLMENT_TYPES: Record<string, string> = {
  shipping: 'Shipping',
  local_delivery: 'Local delivery',
  pickup: 'Store pickup',
  digital: 'Digital delivery',
  service: 'Service',
}

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'expired', 'refunded']
export const ORDER_STATUSES = ['pending_payment', 'new', 'processing', 'on_hold', 'completed', 'cancelled']
export const FULFILLMENT_SUMMARY_STATUSES = [
  'unfulfilled',
  'partially_fulfilled',
  'fulfilled',
  'partially_delivered',
  'delivered',
  'attention_required',
  'returned',
  'cancelled',
]
export const PRODUCT_STATUSES = ['active', 'draft', 'archived']
export const PRODUCT_TYPES = ['physical', 'digital', 'service']