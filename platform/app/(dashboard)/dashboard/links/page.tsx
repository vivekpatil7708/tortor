'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { linkAmountLabel, linkBadge, linkPaidLabel } from '@/lib/link-status'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Plus, ExternalLink, Copy } from 'lucide-react'
import { useToast } from '@/components/toast'
import { LoadError } from '@/components/ui/load-error'

const actionClass = 'inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:text-charcoal'

export default function LinksPage() {
  const { toast } = useToast()
  const [links, setLinks] = useState<Record<string, unknown>[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')

  function load() {
    setLoadState('loading')
    api.getLinks()
      .then(l => { setLinks(l); setLoadState('ready') })
      .catch(() => setLoadState('failed'))
  }

  useEffect(() => { load() }, [])

  const payUrl = (slug: string) => `${window.location.origin}/pay/${slug}`

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(payUrl(slug))
      toast('Link copied to clipboard')
    } catch {
      toast('Could not copy. Open the link and copy it from the address bar.')
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Links</h1>
          <p className="text-sm text-gray-500">Create and manage your payment links.</p>
        </div>
        <Link href="/dashboard/links/new" data-tour="tour-create-link" className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Create Link
        </Link>
      </div>

      {loadState === 'failed' ? (
        <LoadError what="your payment links" onRetry={load} />
      ) : loadState === 'loading' ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading…</p>
      ) : links.length === 0 ? (
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
          {links.map((l) => {
            const slug = l.slug as string
            const badge = linkBadge(l)
            return (
              <div key={l.id as string} className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/links/${l.id}`} className="font-bold hover:underline">{l.title as string}</Link>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.tone}`}>{badge.label}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{linkAmountLabel(l)}</p>
                <p className="mt-0.5 text-xs text-gray-500">{linkPaidLabel(l)} · Created {formatDate(l.created_at as string)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => copyLink(slug)} className={actionClass}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copy link
                  </button>
                  <a href={`https://wa.me/?text=${encodeURIComponent('Pay using this link: ' + payUrl(slug))}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center rounded-xl bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
                    WhatsApp
                  </a>
                  <a href={`/pay/${slug}`} target="_blank" rel="noreferrer" className={actionClass}>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
                  </a>
                  <Link href={`/dashboard/links/${l.id}`} className={`${actionClass} ml-auto`}>Details</Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
