'use client'

import { useEffect, useState } from 'react'

export interface CheckoutView {
  payment: {
    checkout_session_id: string
    status: string
    amount: number
    currency: string
    payment_reference: string
    payment_method: string | null
  }
  order: { order_number: string }
  merchant: { business_name: string; business_logo_url: string | null }
}

interface Props {
  view: CheckoutView
}

export default function SuccessClient({ view }: Props) {
  const { payment, order, merchant } = view
  const [status, setStatus] = useState(payment.status)

  useEffect(() => {
    if (status === 'paid') return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/checkout/${payment.checkout_session_id}`).catch(() => null)
      if (!res) return
      const data = (await res.json().catch(() => null)) as { payment?: CheckoutView['payment'] } | null
      if (data?.payment) setStatus(data.payment.status)
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const confirmed = status === 'paid'
  const formatted = `₹${payment.amount.toLocaleString('en-IN')}`

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-cream p-4 text-charcoal">
      <div className="w-full max-w-md rounded-3xl border border-white bg-white/60 p-8 text-center shadow-2xl shadow-black/10">
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl ${confirmed ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
          <span>{confirmed ? 'OK' : 'WAIT'}</span>
        </div>
        <h1 className="text-xl font-bold">{confirmed ? 'Payment received' : 'Payment processing'}</h1>
        <p className="mt-2 text-sm opacity-70">
          {confirmed
            ? `Thank you! Your payment of ${formatted} to ${merchant.business_name} was received.`
            : 'We received your payment request. It will be confirmed shortly — this page refreshes automatically.'}
        </p>
        <div className="mx-auto mt-5 max-w-xs rounded-xl border border-white bg-white/70 p-4 text-left text-sm">
          <div className="flex justify-between"><span className="opacity-60">Order</span><span className="font-semibold">{order.order_number}</span></div>
          <div className="mt-1 flex justify-between"><span className="opacity-60">Reference</span><span className="font-mono text-xs">{payment.payment_reference}</span></div>
          <div className="mt-1 flex justify-between"><span className="opacity-60">Amount</span><span className="font-semibold">{formatted}</span></div>
          <div className="mt-1 flex justify-between"><span className="opacity-60">Status</span><span className={`font-semibold ${confirmed ? 'text-green-600' : 'text-amber-600'}`}>{status}</span></div>
        </div>
        <p className="mt-6 text-xs opacity-50">Powered by ToroPay</p>
      </div>
    </div>
  )
}