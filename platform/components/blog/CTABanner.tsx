import Link from 'next/link'

export default function CTABanner() {
  return (
    <div className="mt-16 rounded-2xl border border-gray-100 bg-gray-50 p-8 sm:p-10">
      <h3 className="text-xl font-bold tracking-tight text-gray-900">Start accepting free UPI payments</h3>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
        Create your free ToroPay account in 2 minutes. Zero transaction fees, branded payment pages, instant settlement.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href="/signup" className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800">
          Create free account
        </Link>
        <Link href="/login" className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
          Log in
        </Link>
      </div>
    </div>
  )
}
