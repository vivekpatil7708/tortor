import Link from 'next/link'

export default function SuccessPage({ searchParams }: { searchParams: { txn?: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white/60 p-8 text-center backdrop-blur-md">
        <div className="mb-4 text-5xl">✓</div>
        <h1 className="text-2xl font-bold text-green-600">Payment Successful</h1>
        {searchParams.txn && <p className="mt-2 font-mono text-xs text-gray-400">{searchParams.txn}</p>}
        <p className="mt-4 text-sm text-gray-500">Thank you! The merchant has been notified.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-primary-600 hover:underline">Back to home</Link>
      </div>
    </div>
  )
}
