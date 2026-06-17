'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useParams, useRouter } from 'next/navigation'
import { formatDate, formatAmount } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'

export default function LinkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [link, setLink] = useState<Record<string, unknown> | null>(null)
  const [txns, setTxns] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    api.getLink(id).then(setLink).catch(() => {})
    api.getTransactions().then(all => setTxns(all.filter(t => t.payment_link_id === id))).catch(() => {})
  }, [id])

  async function toggleStatus() {
    const newStatus = link?.status === 'active' ? 'inactive' : 'active'
    await api.updateLink(id, { status: newStatus })
    setLink({ ...link!, status: newStatus })
    toast(`Link ${newStatus}`)
  }

  async function deleteLink() {
    if (!confirm('Delete this link permanently?')) return
    await api.deleteLink(id)
    toast('Link deleted')
    router.push('/dashboard/links')
  }

  if (!link) return <div className="text-sm text-gray-400">Loading...</div>

  const payUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${link.slug}`
  const qrUrl = link.amount
    ? `/api/qr?vpa=${encodeURIComponent(link.upi_id as string)}&amount=${link.amount}&txn_id=PREVIEW&note=${encodeURIComponent(link.title as string)}`
    : null

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{link.title as string}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${link.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
          {link.status as string}
        </span>
      </div>

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-3 font-bold">Share</h2>
        <p className="mb-2 break-all font-mono text-sm text-gray-600">{payUrl}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(payUrl); toast('Link copied to clipboard') }}>Copy Link</Button>
          <a href={payUrl} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm">Open Checkout</Button></a>
        </div>
        {qrUrl && (
          <div className="mt-4 text-center">
            <p className="mb-2 text-xs text-gray-500">Sample QR (fixed amount)</p>
            <img src={qrUrl} alt="QR" className="mx-auto h-40 w-40 rounded-xl bg-white p-2" />
          </div>
        )}
      </div>

      <div className="mb-6 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-3 font-bold">Details</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-semibold">{link.amount ? formatAmount(Number(link.amount)) : 'Flexible'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Button Text</span><span className="font-semibold">{(link.button_text as string) || 'Continue to Pay'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">UPI ID</span><span className="font-semibold">{link.upi_id as string}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Uses</span><span className="font-semibold">{link.use_count as number}{link.max_uses ? ` / ${link.max_uses}` : ''}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="font-semibold">{formatDate(link.created_at as string)}</span></div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={toggleStatus}>{link.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
          <Button variant="danger" size="sm" onClick={deleteLink}>Delete</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
        <h2 className="mb-3 font-bold">Transactions ({txns.length})</h2>
        {txns.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {txns.map((t) => (
              <div key={t.id as string} className="flex items-center justify-between rounded-xl bg-white/50 px-4 py-3">
                <div>
                  <p className="text-xs font-mono font-semibold">{t.txn_id as string}</p>
                  <p className="text-xs text-gray-400">{(t.customer_name as string) || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatAmount(Number(t.amount))}</p>
                  <p className={`text-xs ${t.status === 'success' ? 'text-green-600' : t.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>{t.status as string}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
