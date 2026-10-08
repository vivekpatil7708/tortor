// How a payment link reads in the dashboard (U21): whether it still takes
// payments, what it charges, and what it has brought in. The pay page applies
// the same rules (app/pay/[slug]/page.tsx and lib/link-uses.ts).
import { amountRangeHint } from './checkout-form'
import { formatAmount } from './utils'

type Link = Record<string, unknown>

export type LinkBadge = { label: 'Active' | 'Paused' | 'Expired' | 'Used up'; tone: string }

/** Paused (switched off), Expired (past its date), Used up (paid payments reached its limit), or Active. */
export function linkBadge(link: Link, now = Date.now()): LinkBadge {
  if (link.status !== 'active') return { label: 'Paused', tone: 'bg-gray-100 text-gray-600' }
  if (link.expiry_at && new Date(link.expiry_at as string).getTime() < now) return { label: 'Expired', tone: 'bg-red-50 text-red-700' }
  const maxUses = Number(link.max_uses) || 0
  if (maxUses > 0 && Number(link.paid_count ?? 0) >= maxUses) return { label: 'Used up', tone: 'bg-amber-50 text-amber-800' }
  return { label: 'Active', tone: 'bg-green-50 text-green-700' }
}

function products(link: Link): Array<{ price?: unknown }> {
  const fields = Array.isArray(link.custom_fields) ? (link.custom_fields as Array<{ _type?: string; items?: unknown }>) : []
  const entry = fields.find(f => f?._type === 'products')
  return Array.isArray(entry?.items) ? (entry.items as Array<{ price?: unknown }>) : []
}

/** "₹500", "Customer enters amount · Between ₹10 and ₹5,000", "₹249 per item" or "3 products from ₹49". */
export function linkAmountLabel(link: Link): string {
  const items = products(link)
  if (items.length > 0) {
    const prices = items.map(p => parseFloat(String(p?.price ?? ''))).filter(n => Number.isFinite(n) && n > 0)
    const lowest = prices.length ? formatAmount(Math.min(...prices)) : ''
    if (items.length === 1) return lowest ? `${lowest} per item` : '1 product'
    return `${items.length} products${lowest ? ` from ${lowest}` : ''}`
  }
  if (link.amount_flexible || !link.amount) {
    const range = amountRangeHint(link.min_amount as number | null, link.max_amount as number | null)
    return `Customer enters amount${range ? ` · ${range}` : ''}`
  }
  return formatAmount(Number(link.amount))
}

/** "3 paid · ₹1,500 received", or "No payments yet". */
export function linkPaidLabel(link: Link): string {
  const count = Number(link.paid_count ?? 0)
  if (!count) return 'No payments yet'
  return `${count} paid · ${formatAmount(Number(link.paid_total ?? 0))} received`
}
