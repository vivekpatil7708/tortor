import { CircleHelp } from 'lucide-react'

export default function PayNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white/60 p-8 text-center backdrop-blur-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
          <CircleHelp className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">This payment link doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-gray-500">
          It may have been deleted, or the address was typed wrong. Check the link with the seller.
        </p>
      </div>
    </div>
  )
}