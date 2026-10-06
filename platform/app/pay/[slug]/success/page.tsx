import { CheckCircle2, Clock, SearchX, ShieldCheck, XCircle } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { formatAmount } from '@/lib/utils'
import CopyButton from '@/components/ui/copy-button'

export const dynamic = 'force-dynamic'

const STATES = {
  success: { Icon: CheckCircle2, title: 'Payment confirmed', color: 'text-green-600', note: (seller: string) => `${seller} has confirmed your payment. Thank you!` },
  pending: { Icon: Clock, title: 'Waiting for confirmation', color: 'text-amber-600', note: (seller: string) => `${seller} will confirm your payment once the money reaches their account. This page shows the latest status whenever you open it.` },
  failed: { Icon: XCircle, title: 'Payment not confirmed', color: 'text-red-600', note: (seller: string) => `${seller} could not confirm this payment. If money left your account, contact them with the reference below.` },
  unknown: { Icon: SearchX, title: 'Payment not found', color: 'text-gray-600', note: () => 'We could not find this payment. Please check the link you were sent.' },
} as const

const istTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
})
/** "7 Oct 2026, 3:45 pm IST": customers are in India, whatever the server's time zone. */
const inIndia = (date: Date) => `${istTime.format(date)} IST`

export default async function SuccessPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ txn?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  // Always show the status stored in the database, never one taken from the URL.
  const txn = searchParams.txn
    ? await prisma.transaction.findUnique({
        where: { txnId: searchParams.txn },
        select: {
          txnId: true, amount: true, status: true, createdAt: true, confirmedAt: true,
          paymentLink: { select: { slug: true, title: true } },
          // Only what the business shows its customers: never its login email or phone.
          merchant: { select: { businessName: true, businessLogoUrl: true, supportEmail: true, supportPhone: true } },
        },
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
  const business = found?.merchant.businessName.trim() || ''
  const seller = business || 'the seller'
  const Seller = business || 'The seller'
  const supportEmail = found?.merchant.supportEmail || null
  const supportPhone = found?.merchant.supportPhone || null

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4 text-charcoal">
      <div className="w-full max-w-sm rounded-3xl border border-white bg-white/95 p-6 shadow-2xl shadow-black/10 sm:p-8">
        <div className="text-center">
          {found?.merchant.businessLogoUrl && (
            <img src={found.merchant.businessLogoUrl} className="mx-auto mb-3 h-10 object-contain" alt="" />
          )}
          <state.Icon className={`mx-auto h-12 w-12 ${state.color}`} aria-hidden />
          <h1 className={`mt-3 text-2xl font-bold ${state.color}`}>{state.title}</h1>
          {found && <p className="mt-2 text-3xl font-bold tracking-tight">{formatAmount(found.amount)}</p>}
          <p className="mt-3 text-sm text-gray-600">{state.note(Seller)}</p>
        </div>

        {found && (
          <dl className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm">
            {business && (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-gray-500">Paid to</dt>
                <dd className="text-right font-semibold">{business}</dd>
              </div>
            )}
            {found.paymentLink?.title && (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-gray-500">For</dt>
                <dd className="text-right font-semibold">{found.paymentLink.title}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-gray-500">Date</dt>
              <dd className="text-right">{inIndia(found.createdAt)}</dd>
            </div>
            {found.status === 'success' && found.confirmedAt && (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-gray-500">Confirmed</dt>
                <dd className="text-right">{inIndia(found.confirmedAt)}</dd>
              </div>
            )}
            <div className="py-2.5">
              <dt className="text-gray-500">Reference</dt>
              <dd className="mt-1 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-xs">{found.txnId}</span>
                <CopyButton text={found.txnId} className="border border-gray-200 bg-white hover:bg-gray-50" />
              </dd>
            </div>
          </dl>
        )}

        {state === STATES.failed && (
          <a href={`/pay/${encodeURIComponent(params.slug)}`}
            className="mt-6 block rounded-xl bg-charcoal px-8 py-3 text-center text-sm font-semibold text-white hover:opacity-90">
            Try again
          </a>
        )}

        {(supportEmail || supportPhone) && (
          <div className="mt-6 text-center text-sm text-gray-600">
            <p>Questions about this payment? Contact {seller}:</p>
            {supportEmail && (
              <p className="mt-1"><a href={`mailto:${supportEmail}`} className="font-semibold text-primary-600 hover:underline">{supportEmail}</a></p>
            )}
            {supportPhone && (
              <p className="mt-1"><a href={`tel:${supportPhone.replace(/[^\d+]/g, '')}`} className="font-semibold text-primary-600 hover:underline">{supportPhone}</a></p>
            )}
          </div>
        )}

        {found && (
          <p className="mt-6 flex items-start justify-center gap-1.5 text-center text-xs text-gray-500">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>UPI payments go straight to {seller}. ToroPay never holds your money.</span>
          </p>
        )}
      </div>
    </div>
  )
}
