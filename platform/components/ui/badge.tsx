import { cn } from '@/lib/utils'

const styles: Record<string, string> = {
  green: 'bg-green-50 text-green-700 ring-green-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
}

export type BadgeTone = keyof typeof styles

export function statusTone(status: string): BadgeTone {
  const s = status.toLowerCase()
  if (['paid', 'delivered', 'completed', 'active', 'success'].includes(s)) return 'green'
  if (['pending', 'processing', 'packed', 'on_hold', 'on-hold', 'draft', 'not_shipped', 'pending_payment'].includes(s)) return 'yellow'
  if (['shipped', 'in_transit', 'out_for_delivery', 'in_transit'].includes(s)) return 'blue'
  if (['failed', 'cancelled', 'delivery_failed', 'returned', 'expired', 'refunded', 'archived'].includes(s)) return 'red'
  return 'gray'
}

export function Badge({ tone, className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  const t = tone ?? statusTone(String(children ?? '').replace(/[_]/g, ' '))
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset', styles[t], className)}>
      {children}
    </span>
  )
}