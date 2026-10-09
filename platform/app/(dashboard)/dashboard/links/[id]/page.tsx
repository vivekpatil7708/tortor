'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { formatDate, formatAmount } from '@/lib/utils'
import { linkAmountLabel, linkBadge } from '@/lib/link-status'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { useTransactionPages } from '@/lib/use-transaction-pages'
import { LoadError } from '@/components/ui/load-error'
import { paymentHref, StatusBadge } from '@/components/dashboard/transaction-row'

/** A link that looks like the small secondary button. */
const linkButton = 'inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal hover:bg-gray-50'

export default function LinkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  // Set when the merchant has just created this link (from the New link form).
  const justCreated = useSearchParams().get('created') === '1'
  const { toast } = useToast()
  const [link, setLink] = useState<Record<string, unknown> | null>(null)
  const [linkFailed, setLinkFailed] = useState(false)
  // Only this link's payments, from the server (not filtered from the newest few hundred).
  const { rows: txns, total, loading: txnsLoading, error: txnsError, hasMore, loadMore, reload } = useTransactionPages({ link: id })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function renderOrderDetails(t: Record<string, unknown>) {
    const cfv = t.custom_field_values as Record<string, unknown> | undefined
    if (!cfv) return null
    const products = cfv._selected_products as Array<{ name: string; price: string; category: string; quantity?: number }> | undefined
    const note = t.customer_note as string | null
    const otherFields = Object.entries(cfv).filter(([k]) => k !== '_selected_products')
    if (!products?.length && !otherFields.length && !note) return null
    return (
      <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
        {products && products.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500">Products</p>
            {products.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-gray-100 px-3 py-1 text-xs">
                <span>{p.name}{p.category ? ` (${p.category})` : ''}{p.quantity && p.quantity > 1 ? ` × ${p.quantity}` : ''}</span>
                <span className="font-medium">₹{Number(p.price) * (p.quantity || 1)}</span>
              </div>
            ))}
          </div>
        )}
        {otherFields.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500">Custom Fields</p>
            {otherFields.map(([k, v]) => (
              <div key={k} className="rounded bg-gray-100 px-3 py-1 text-xs">
                <span className="text-gray-500">{k}:</span> {String(v)}
              </div>
            ))}
          </div>
        )}
        {note && <div className="rounded bg-gray-100 px-3 py-1 text-xs"><span className="text-gray-500">Note:</span> {note}</div>}
      </div>
    )
  }

  function loadLink() {
    setLinkFailed(false)
    api.getLink(id).then(setLink).catch(() => setLinkFailed(true))
  }

  useEffect(() => { loadLink() }, [id])

  async function toggleStatus() {
    const newStatus = link?.status === 'active' ? 'inactive' : 'active'
    await api.updateLink(id, { status: newStatus })
    setLink({ ...link!, status: newStatus })
    toast(newStatus === 'active' ? 'Link turned back on' : 'Link paused')
  }

  async function deleteLink() {
    if (!confirm('Delete this link permanently?')) return
    await api.deleteLink(id)
    toast('Link deleted')
    router.push('/dashboard/links')
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast('Link copied to clipboard')
    } catch {
      toast('Could not copy. Select the link above and copy it.')
    }
  }

  if (!link) {
    return linkFailed
      ? <LoadError what="this payment link" onRetry={loadLink} />
      : <div className="text-sm text-gray-500">Loading...</div>
  }

  const slug = link.slug as string
  const payUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${slug}`
  // Opens the payment page, so every payment made from a printed code gets a record (U22).
  const qrUrl = `/api/qr/link?slug=${encodeURIComponent(slug)}`
  const badge = linkBadge(link)
  const paidCount = Number(link.paid_count ?? 0)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{link.title as string}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge.tone}`}>{badge.label}</span>
      </div>

      {justCreated && (
        <div role="status" className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">Your payment link is ready.</p>
          <p className="mt-0.5">Share it on WhatsApp, copy it, or print its QR code below.</p>
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-3 font-bold">Share</h2>
        <p className="mb-2 break-all font-mono text-sm text-gray-600">{payUrl}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => copy(payUrl)}>Copy link</Button>
          <a href={payUrl} target="_blank" rel="noreferrer" className={linkButton}>Open payment page</a>
          <a href={`https://wa.me/?text=${encodeURIComponent('Pay using this link: ' + payUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">WhatsApp</a>
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Pay me using this link: ' + payUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#000] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">X</a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(payUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#0A66C2] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">LinkedIn</a>
        </div>

        <div className="mt-5 flex flex-col items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-start">
          <img src={qrUrl} alt="QR code that opens this payment link" className="h-36 w-36 shrink-0" />
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold">QR code for this link</p>
            <p className="mt-1 text-xs text-gray-500">
              Customers scan it with their phone camera to open your payment page, so every payment is recorded here.
              The scanners inside UPI apps only read UPI codes.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <a href={qrUrl} download={`toropay-${slug}-qr.png`} className={linkButton}>Download QR</a>
              <Link href={`/dashboard/links/${id}/poster`} className={linkButton}>Print poster</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-3 font-bold">Details</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4"><span className="text-gray-500">Amount</span><span className="text-right font-semibold">{linkAmountLabel(link)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-gray-500">Button Text</span><span className="text-right font-semibold">{(link.button_text as string) || 'Continue to Pay'}</span></div>
          <div className="flex justify-between gap-4"><span className="text-gray-500">UPI ID</span><span className="text-right font-semibold">{link.upi_id as string}</span></div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Paid</span>
            <span className="text-right font-semibold">
              {paidCount}{link.max_uses ? ` of ${link.max_uses}` : ''}
              {paidCount > 0 && <span className="font-normal text-gray-500"> · {formatAmount(Number(link.paid_total ?? 0))} received</span>}
              {Number(link.in_progress_count ?? 0) > 0 && <span className="font-normal text-gray-500"> · {Number(link.in_progress_count)} in progress</span>}
            </span>
          </div>
          {Boolean(link.expiry_at) && (
            <div className="flex justify-between gap-4"><span className="text-gray-500">Expires</span><span className="text-right font-semibold">{formatDate(link.expiry_at as string)}</span></div>
          )}
          <div className="flex justify-between gap-4"><span className="text-gray-500">Created</span><span className="text-right font-semibold">{formatDate(link.created_at as string)}</span></div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={toggleStatus}>{link.status === 'active' ? 'Pause link' : 'Turn back on'}</Button>
          <Button variant="danger" size="sm" onClick={deleteLink}>Delete</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-3 font-bold">Transactions ({total ?? txns.length})</h2>
        {txns.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            {txnsError ? (
              <>Couldn&apos;t load transactions. <button onClick={reload} className="font-semibold text-charcoal underline">Retry</button></>
            ) : txnsLoading ? 'Loading…' : 'No transactions yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {txns.map((t) => {
              const tid = t.id as string
              const isExpanded = expanded.has(tid)
              const cfv = t.custom_field_values
              const hasDetails = !!(cfv && (cfv as Record<string, unknown>)._selected_products || (cfv && Object.keys(cfv as Record<string, unknown>).length > 0) || t.customer_note)
              return (
              <div key={tid} className="rounded-xl bg-white/50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={paymentHref(t)} className="text-sm font-semibold hover:underline">
                      {(t.customer_name as string) || 'Anonymous'} · {(t.customer_phone as string) || '—'}
                    </Link>
                    <p className="break-words text-xs text-gray-500">{t.txn_id as string} · {formatDate(t.created_at as string)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">{formatAmount(Number(t.amount))}</p>
                    <StatusBadge txn={t} />
                  </div>
                </div>
                {hasDetails && (
                  <button onClick={() => toggleExpand(tid)}
                    className="mt-1 text-xs font-semibold text-gray-500 hover:text-charcoal">
                    {isExpanded ? '▲ Hide' : '▼ Details'}
                  </button>
                )}
                {isExpanded && hasDetails && renderOrderDetails(t)}
              </div>
            )})}
          </div>
        )}
        {txns.length > 0 && hasMore && (
          <div className="mt-3 text-center">
            {txnsError && <p className="mb-2 text-xs text-red-500">Couldn&apos;t load more transactions.</p>}
            <button onClick={loadMore} disabled={txnsLoading}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal hover:bg-gray-50 disabled:opacity-40">
              {txnsLoading ? 'Loading…' : txnsError ? 'Retry' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
