import { NextRequest, NextResponse } from 'next/server'
import { apiError, publicErrorMessage } from '@/lib/api-response'
import { applyCouponToCheckout, removeCouponFromCheckout } from '@/lib/coupons'

/**
 * Public: apply a coupon to a pending checkout session.
 *
 * The session id is the only credential, and it is an unguessable nanoid, so a
 * shopper holding the checkout link can validate codes for that one checkout.
 * Applying updates the order (discount, total) and the payment amount that the
 * provider will be asked to charge.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { session?: unknown; code?: unknown } | null
    const session = typeof body?.session === 'string' ? body.session : ''
    const code = typeof body?.code === 'string' ? body.code : ''
    if (!session) return apiError(400, 'Checkout session is required')
    if (!code.trim()) return apiError(400, 'Enter a coupon code')

    const result = await applyCouponToCheckout(session, code)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not apply this coupon')
    return apiError(msg === 'Checkout not found.' ? 404 : 400, msg)
  }
}

/** Public: remove the coupon from a pending checkout and restore the total. */
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { session?: unknown } | null
    const session = typeof body?.session === 'string' ? body.session : ''
    if (!session) return apiError(400, 'Checkout session is required')

    const totals = await removeCouponFromCheckout(session)
    return NextResponse.json({ coupon: null, totals }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const msg = publicErrorMessage(err, 'Could not remove this coupon')
    return apiError(msg === 'Checkout not found.' ? 404 : 400, msg)
  }
}
