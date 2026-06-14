export default async function FailedPage({ params, searchParams }: { params: { slug: string }; searchParams: { txn?: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white/60 p-8 text-center backdrop-blur-md">
        <div className="mb-4 text-6xl">❌</div>
        <h1 className="text-2xl font-bold tracking-tight">Payment Failed</h1>
        <p className="mt-2 text-sm text-gray-500">
          {searchParams.txn
            ? <>Transaction <span className="font-mono font-semibold text-charcoal">{searchParams.txn}</span> could not be completed.</>
            : 'The transaction could not be completed.'}
        </p>
        <p className="mt-1 text-sm text-gray-400">Please try again or use a different UPI app.</p>
        <a href={`/pay/${params.slug}`} className="mt-6 inline-block rounded-xl bg-charcoal px-8 py-3 text-sm font-semibold text-white hover:opacity-90">
          Try again
        </a>
      </div>
    </div>
  )
}
