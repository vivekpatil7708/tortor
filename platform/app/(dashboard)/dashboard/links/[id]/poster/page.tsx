'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { api } from '@/lib/api'
import { linkAmountLabel } from '@/lib/link-status'
import { LoadError } from '@/components/ui/load-error'

/** A printable poster for a shop counter: the business, what it's for, and a QR code that opens the payment page (U22). */
export default function LinkPosterPage() {
  const { id } = useParams<{ id: string }>()
  const [link, setLink] = useState<Record<string, unknown> | null>(null)
  const [merchant, setMerchant] = useState<Record<string, unknown> | null>(null)
  const [failed, setFailed] = useState(false)

  function load() {
    setFailed(false)
    api.getLink(id).then(setLink).catch(() => setFailed(true))
    api.me().then(({ merchant: m }) => setMerchant(m)).catch(() => {})
  }

  useEffect(() => { load() }, [id])

  if (failed) return <LoadError what="this payment link" onRetry={load} />
  if (!link) return <div className="text-sm text-gray-400">Loading...</div>

  const slug = link.slug as string
  const business = ((merchant?.business_name as string) || '').trim()
  const logo = merchant?.business_logo_url as string | null | undefined
  const address = `${window.location.host}/pay/${slug}`

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          <Printer className="h-4 w-4" aria-hidden /> Print poster
        </button>
        <Link href={`/dashboard/links/${id}`} className="text-sm font-semibold text-gray-500 hover:text-charcoal">Back to link</Link>
        <p className="w-full text-xs text-gray-500">Prints on one A4 page. You can also choose &quot;Save as PDF&quot; in the print window.</p>
      </div>

      <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center text-charcoal print:max-w-none print:border-0 print:p-0">
        {logo && <img src={logo} alt="" className="mx-auto mb-3 h-16 object-contain" />}
        {business && <p className="text-3xl font-extrabold tracking-tight">{business}</p>}
        <p className="mt-2 text-xl font-semibold">{link.title as string}</p>
        <p className="mt-1 text-lg text-gray-700">{linkAmountLabel(link)}</p>
        <img src={`/api/qr/link?slug=${encodeURIComponent(slug)}`} alt="QR code that opens the payment page"
          className="mx-auto mt-6 h-72 w-72" />
        <p className="mt-4 text-xl font-bold">Scan with your phone camera to pay</p>
        <p className="mt-1 text-base text-gray-700">Then pay in any UPI app: Google Pay, PhonePe, Paytm, BHIM</p>
        <p className="mt-4 break-all font-mono text-sm text-gray-700">{address}</p>
        <p className="mt-6 text-sm text-gray-600">Payments go straight to {business || 'the seller'} by UPI. Secured by ToroPay.</p>
      </div>
    </div>
  )
}
