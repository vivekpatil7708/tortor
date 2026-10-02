import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCheckoutView } from '@/lib/checkout'

export const dynamic = 'force-dynamic'

export default async function CheckoutCancelPage({ params }: { params: { session: string } }) {
  const view = await getCheckoutView(params.session)
  if (!view) notFound()
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-cream p-4 text-charcoal">
      <div className="w-full max-w-md rounded-3xl border border-white bg-white/60 p-8 text-center shadow-2xl shadow-black/10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600">
          <span>X</span>
        </div>
        <h1 className="text-xl font-bold">Payment cancelled</h1>
        <p className="mt-2 text-sm opacity-70">
          Your payment for order {view.order.order_number} was cancelled. No money was moved.
        </p>
        <Link
          href={`/checkout/${view.payment.checkout_session_id}`}
          className="mt-6 inline-block rounded-xl bg-charcoal px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-80"
        >
          Try again
        </Link>
        <p className="mt-6 text-xs opacity-50">Powered by ToroPay</p>
      </div>
    </div>
  )
}