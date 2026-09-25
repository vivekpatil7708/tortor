import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { getShopifyConnection, handleShopifyOrderCreated, handleShopifyOrderPaid } from '@/lib/shopify'
import { apiError, badRequest } from '@/lib/api-response'
import { z } from 'zod'
import { zodMessage } from '@/lib/zod-error'

const testSchema = z.object({
  event: z.enum(['orders/create', 'orders/paid']),
  order_id: z.number().int().positive().optional(),
  line_items: z
    .array(
      z.object({
        title: z.string().min(1),
        quantity: z.number().int().positive(),
        price: z.number().nonnegative(),
        sku: z.string().max(100).optional().nullable(),
      })
    )
    .max(25)
    .optional(),
  total_price: z.number().positive().optional(),
})

/**
 * Dashboard test sender: signs nothing (already authenticated), but runs the
 * exact same handlers the public webhook uses, so merchants can validate the
 * integration (including the secure checkout + shopify:<id> matching) locally.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const conn = await getShopifyConnection(session.id)
    if (!conn) return apiError(409, 'Connect your Shopify store first')

    const body = await req.json().catch(() => null)
    const parsed = testSchema.safeParse(body)
    if (!parsed.success) return badRequest(zodMessage(parsed.error) ?? 'Invalid test event')

    const orderId = parsed.data.order_id ?? Math.floor(100000 + Math.random() * 899999)
    const errorSink = async (message: string) => {
      await prisma.shopifyConnection.update({
        where: { id: conn.id },
        data: { lastError: message.slice(0, 500) },
      })
    }

    if (parsed.data.event === 'orders/create') {
      const lineItems = parsed.data.line_items ?? [
        { title: 'Demo product', quantity: 1, price: Math.round((parsed.data.total_price ?? 499) * 100) / 100, sku: null },
      ]
      const total = parsed.data.total_price ?? lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0)
      const result = await handleShopifyOrderCreated(
        conn,
        { id: orderId, line_items: lineItems, total_price: total },
        errorSink
      )
      if (!result.ok) return apiError(422, result.error || 'Test order could not be created')
      await prisma.shopifyConnection.update({ where: { id: conn.id }, data: { lastEventAt: new Date() } })
      return NextResponse.json({
        ok: true,
        checkout_session_id: result.checkout_session_id ?? null,
        checkout_url: result.checkout_url ?? null,
        order_id: orderId,
      })
    }

    const result = await handleShopifyOrderPaid(conn, { id: orderId }, errorSink)
    if (!result.ok) return apiError(404, result.error || 'No matching payment for that Shopify order')
    await prisma.shopifyConnection.update({ where: { id: conn.id }, data: { lastEventAt: new Date() } })
    return NextResponse.json({ ok: true, payment_id: result.payment_id ?? null, changed: result.changed ?? false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send Shopify test event'
    return apiError(msg === 'Unauthorized' ? 401 : 500, msg)
  }
}