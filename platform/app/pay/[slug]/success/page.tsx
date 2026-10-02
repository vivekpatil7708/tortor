import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatAmount } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const STATES = {
  success: { icon: '✓', title: 'Payment confirmed', color: 'text-green-600', note: 'The merchant has confirmed your payment. Thank you!' },
  pending: { icon: '…', title: 'Waiting for confirmation', color: 'text-amber-600', note: 'The merchant will confirm your payment once the money reaches their account.' },
  failed: { icon: '!', title: 'Payment not confirmed', color: 'text-red-600', note: 'The merchant could not confirm this payment. If money left your account, please contact them.' },
  unknown: { icon: '?', title: 'Payment not found', color: 'text-gray-600', note: 'We could not find this payment.' },
} as const

export default async function SuccessPage({ params, searchParams }: { params: { slug: string }; searchParams: { txn?: string } }) {
  // Always show the status stored in the database, never one taken from the URL.
  const txn = searchParams.txn
    ? await prisma.transaction.findUnique({
        where: { txnId: searchParams.txn },
        select: { txnId: true, amount: true, status: true, paymentLink: { select: { slug: true } } },
      })
    : null
  const found = txn && txn.paymentLink?.slug === params.slug ? txn : null
  const state = !found
    ? STATES.unknown
    : found.status === 'success'
      ? STATES.success
      : found.status === 'failed'
        ? STATES.failed
        : STATES.pending

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white/60 p-8 text-center backdrop-blur-md">
        <div className="mb-4 text-5xl">{state.icon}</div>
        <h1 className={`text-2xl font-bold ${state.color}`}>{state.title}</h1>
        {found && <p className="mt-2 text-sm font-semibold">{formatAmount(found.amount)}</p>}
        {found && <p className="mt-1 font-mono text-xs text-gray-400">{found.txnId}</p>}
        <p className="mt-4 text-sm text-gray-500">{state.note}</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-primary-600 hover:underline">Back to home</Link>
      </div>
    </div>
  )
}
