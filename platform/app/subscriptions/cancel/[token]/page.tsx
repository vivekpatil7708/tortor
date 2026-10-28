import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { billingDayLabel, frequencyLabel } from '@/lib/subscription-plan'
import { formatMoney } from '@/lib/ui-format'
import CancelClient from './cancel-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Cancel subscription – ToroPay',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </p>
        {children}
      </div>
    </main>
  )
}

export default async function CancelSubscriptionPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params
  const subscription = await prisma.subscription.findUnique({
    where: { cancelToken: token },
    include: {
      customer: { select: { fullName: true } },
      merchant: {
        select: { businessName: true, email: true, supportEmail: true, supportPhone: true },
      },
    },
  })

  if (!subscription) {
    return (
      <Shell>
        <h1 className="mt-6 text-lg font-bold">This cancellation link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-gray-600">
          The link may have been copied incorrectly. Contact the business you subscribed to and
          they can cancel it for you.
        </p>
      </Shell>
    )
  }

  const business = subscription.merchant.businessName || subscription.merchant.email
  const cancelled = subscription.status === 'cancelled'

  return (
    <Shell>
      <h1 className="mt-6 text-lg font-bold">
        {cancelled ? 'Subscription already cancelled' : 'Cancel your subscription?'}
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        {cancelled
          ? `This subscription with ${business} is already cancelled. No further payment links will be sent.`
          : `Review the plan below. Cancelling stops future payment links from ${business}.`}
      </p>

      <div className="mt-4 space-y-2 rounded-2xl bg-gray-50 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">Customer</span>
          <span className="text-right font-semibold">{subscription.customer.fullName}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">Plan</span>
          <span className="text-right font-semibold">{subscription.planName}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">Amount</span>
          <span className="text-right font-semibold">
            {formatMoney(subscription.amount)} / {frequencyLabel(subscription.frequency).toLowerCase()}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">Next billing</span>
          <span className="text-right font-semibold">
            {cancelled ? 'Cancelled' : billingDayLabel(subscription.nextBillingDate)}
          </span>
        </div>
      </div>

      {!cancelled && (
        <p className="mt-4 text-xs text-gray-500">
          Already-made payments are not refunded. If you need a refund, contact the business.
          {subscription.merchant.supportEmail || subscription.merchant.supportPhone ? (
            <>
              {' '}Support: {[subscription.merchant.supportEmail, subscription.merchant.supportPhone].filter(Boolean).join(' · ')}
            </>
          ) : null}
        </p>
      )}

      <CancelClient
        token={token}
        business={business}
        alreadyCancelled={cancelled}
      />
    </Shell>
  )
}
