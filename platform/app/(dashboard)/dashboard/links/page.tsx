'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatAmount, formatDate, statusColor } from '@/lib/utils'
import Link from 'next/link'
import { Plus, ExternalLink, Copy } from 'lucide-react'
import { useToast } from '@/components/toast'

export default function LinksPage() {
  const { toast } = useToast()
  const [links, setLinks] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    api.getLinks().then(setLinks).catch(() => {})
  }, [])

  async function copyLink(slug: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/pay/${slug}`)
    toast('Link copied to clipboard')
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Links</h1>
          <p className="text-sm text-gray-500">Create and manage your payment links.</p>
        </div>
        <Link href="/dashboard/links/new" className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Create Link
        </Link>
      </div>

      {links.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center backdrop-blur-sm">
          <div className="mb-3 text-4xl">🔗</div>
          <h2 className="mb-1 text-lg font-bold">No payment links yet</h2>
          <p className="mb-4 text-sm text-gray-500">Create your first payment link to start accepting UPI payments.</p>
          <Link href="/dashboard/links/new" className="inline-block rounded-xl bg-charcoal px-6 py-3 text-sm font-semibold text-white hover:opacity-90">
            Create your first link
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <div key={l.id as string} className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold">{l.title as string}</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(l.status as string)}`}>{l.status as string}</span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {l.amount ? formatAmount(Number(l.amount)) : 'Flexible amount'} · {l.use_count as number} uses · Created {formatDate(l.created_at as string)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => copyLink(l.slug as string)} className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 hover:text-charcoal"><Copy className="h-4 w-4" /></button>
                <a href={`/pay/${l.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 hover:text-charcoal"><ExternalLink className="h-4 w-4" /></a>
                <Link href={`/dashboard/links/${l.id}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-500 hover:text-charcoal">Details</Link>
                <div className="hidden sm:flex gap-1">
                  <a href={`https://wa.me/?text=${encodeURIComponent('Pay using this link: ' + window.location.origin + '/pay/' + l.slug)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90">WA</a>
                  <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Pay me using this link: ' + window.location.origin + '/pay/' + l.slug)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#000] px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90">X</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
