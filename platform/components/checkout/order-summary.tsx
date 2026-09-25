'use client'

import { ShieldCheck } from 'lucide-react'

export interface OrderSummaryItem {
  name: string
  sku?: string | null
  quantity: number
  unit_price: number
  line_total: number
}

interface OrderSummaryProps {
  items: OrderSummaryItem[]
  subtotal: number
  discount?: number
  shipping?: number
  tax?: number
  total: number
  currency?: string
  isDark?: boolean
  verified?: boolean
}

function formatAmount(n: number, currency?: string) {
  const symbol = !currency || currency === 'INR' ? '₹' : `${currency} `
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

/**
 * Live, backend-verified order summary. When `verified` is set, a badge shows
 * that the payable amount was recomputed and validated server-side.
 */
export default function OrderSummary({
  items,
  subtotal,
  discount = 0,
  shipping = 0,
  tax = 0,
  total,
  currency,
  isDark = false,
  verified = false,
}: OrderSummaryProps) {
  const rowBg = isDark ? 'bg-white/10 border-white/10' : 'bg-white/10 border-white/20'
  const rows: Array<[string, number]> = []
  if (items.length > 1 || subtotal !== total) rows.push(['Subtotal', subtotal])
  if (discount > 0) rows.push(['Discount', -discount])
  if (shipping > 0) rows.push(['Shipping', shipping])
  if (tax > 0) rows.push(['Tax', tax])

  return (
    <div className="space-y-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider opacity-50">Order Summary</p>
        {verified && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark
              ? 'bg-green-500/20 text-green-300'
              : 'bg-green-100 text-green-700'}`}
          >
            <ShieldCheck className="h-3 w-3" /> Amount verified
          </span>
        )}
      </div>

      {items.map((item, i) => (
        <div key={i} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 backdrop-blur-sm ${rowBg}`}>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{item.name}</p>
            {item.sku && <p className="text-xs opacity-50">{item.sku}</p>}
            {item.quantity > 1 && <p className="text-xs opacity-50">× {item.quantity}</p>}
          </div>
          <p className="text-sm font-semibold">{formatAmount(item.line_total, currency)}</p>
        </div>
      ))}

      {rows.length > 0 && (
        <div className={`space-y-1 rounded-xl border px-4 py-3 text-sm backdrop-blur-sm ${rowBg}`}>
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="opacity-70">{label}</span>
              <span className="font-medium">{formatAmount(value, currency)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-white/20 pt-2">
            <span className="font-bold">Total</span>
            <span className="text-base font-extrabold">{formatAmount(total, currency)}</span>
          </div>
        </div>
      )}
    </div>
  )
}