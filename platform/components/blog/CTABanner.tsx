import Link from 'next/link'

export default function CTABanner() {
  return (
    <div className="not-prose mt-16 overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 sm:p-10">
      <div className="flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-600">
          ToroPay
        </span>
      </div>
      <h3 className="mt-4 font-serif text-2xl font-bold leading-tight tracking-tight text-gray-900">
        Start accepting free UPI payments
      </h3>
      <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-gray-500">
        Create your free account in 2 minutes. Zero transaction fees, branded payment pages, instant settlement — no KYC required.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800">
          Create free account
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        </Link>
        <Link href="/login" className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900">
          Log in
        </Link>
      </div>
    </div>
  )
}
