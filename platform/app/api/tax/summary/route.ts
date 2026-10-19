import { NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { stateName } from '@/lib/tax'

/**
 * What tax has been recorded on orders, for the merchant to review.
 *
 * This reports the `taxAmount` already stored on each order. It does not
 * calculate tax, because the rules for doing so are not settled - see
 * lib/tax.ts. A merchant can use this to see whether tax is being captured at
 * all before any invoice is issued.
 */
export async function GET() {
  try {
    const session = await requireMerchant()

    const orders = await prisma.order.findMany({
      where: { merchantId: session.id, testMode: false, orderStatus: { not: 'cancelled' } },
      select: {
        totalAmount: true,
        taxAmount: true,
        paymentStatus: true,
        shippingAddressSnapshot: true,
      },
    })

    let ordersTotal = 0
    let taxRecorded = 0
    let ordersWithTax = 0
    const byStatus: Record<string, { orders: number; total: number; tax: number }> = {}

    for (const o of orders) {
      const total = o.totalAmount.toNumber()
      const tax = o.taxAmount.toNumber()
      ordersTotal += total
      taxRecorded += tax
      if (tax > 0) ordersWithTax++

      const row = (byStatus[o.paymentStatus] ??= { orders: 0, total: 0, tax: 0 })
      row.orders += 1
      row.total += total
      row.tax += tax
    }

    // A rough read on where orders are going, which is what any future
    // intra-state / inter-state split would depend on. The snapshot stores the
    // state as a name, not a code, so it is grouped exactly as recorded.
    const byState: Record<string, { orders: number; total: number }> = {}
    for (const o of orders) {
      const snapshot = o.shippingAddressSnapshot as { state?: unknown } | null
      const rawState = snapshot && typeof snapshot.state === 'string' ? snapshot.state.trim() : ''
      const key = rawState || 'Not recorded'
      const row = (byState[key] ??= { orders: 0, total: 0 })
      row.orders += 1
      row.total += o.totalAmount.toNumber()
    }

    return NextResponse.json({
      summary: {
        orders: orders.length,
        orders_total: ordersTotal,
        tax_recorded: taxRecorded,
        orders_with_tax: ordersWithTax,
        // True when nothing has been captured, which is the normal state until
        // tax rates are decided and applied.
        tax_missing: ordersWithTax === 0 && orders.length > 0,
      },
      merchant: {
        tax_scheme: session.taxScheme ?? 'unregistered',
        gstin: session.gstin ?? null,
        state_code: session.stateCode ?? null,
        state_name: stateName(session.stateCode),
      },
      by_payment_status: Object.entries(byStatus).map(([status, v]) => ({
        status, orders: v.orders, total: v.total, tax: v.tax,
      })),
      by_destination_state: Object.entries(byState)
        .map(([state, v]) => ({ state, orders: v.orders, total: v.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 12),
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
