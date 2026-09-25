'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, X } from 'lucide-react'

interface ReturnItemView {
  id: string
  quantity: number
  orderItem: { productNameSnapshot: string; skuSnapshot: string }
}

interface ReturnView {
  id: string
  returnNumber: string
  status: string
  reason: string
  createdAt: string
  items: ReturnItemView[]
  order: { id: string; orderNumber: string; totalAmount: string | number }
  refunds: Array<{ id: string; status: string; amount: string | number }>
}

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  approved: 'Approved',
  return_pickup_scheduled: 'Pickup scheduled',
  return_in_transit: 'In transit',
  returned_to_merchant: 'Received',
  refund_pending: 'Refund pending',
  refund_initiated: 'Refund initiated',
  refunded: 'Refunded',
  rejected: 'Rejected',
  closed: 'Closed',
}

const RETURN_ACTIONS = [
  { action: 'approve', label: 'Approve', toStatus: 'approved', tone: 'green' },
  { action: 'reject', label: 'Reject', toStatus: 'rejected', tone: 'red' },
  { action: 'schedule_pickup', label: 'Schedule pickup', toStatus: 'return_pickup_scheduled', tone: 'gray' },
  { action: 'mark_transit', label: 'Mark in transit', toStatus: 'return_in_transit', tone: 'gray' },
  { action: 'mark_received', label: 'Mark received', toStatus: 'returned_to_merchant', tone: 'gray' },
] as const

interface OrderOption {
  id: string
  order_number: string
  order_items: Array<{ id: string; product_name_snapshot: string; quantity_fulfilled: number; quantity_ordered: number; quantity_returned: number; quantity_cancelled: number }>
}

function jfetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }).then(async res => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? 'Request failed')
    }
    return res.json() as Promise<T>
  })
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'blue'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-500',
    blue: 'bg-blue-100 text-blue-700',
  }
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (['refunded', 'closed'].includes(status)) return 'green'
  if (['return_in_transit', 'return_pickup_scheduled'].includes(status)) return 'blue'
  if (status === 'rejected') return 'red'
  if (['returned_to_merchant', 'refund_pending', 'refund_initiated'].includes(status)) return 'amber'
  return 'gray'
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnView[]>([])
  const [orders, setOrders] = useState<OrderOption[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)

  const [orderId, setOrderId] = useState('')
  const [windowItems, setWindowItems] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await jfetch<{ returns: ReturnView[] }>('/api/returns')
      setReturns(res.returns)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])

  const loadOrders = useCallback(async () => {
    try {
      const res = await jfetch<{ orders: OrderOption[] }>('/api/orders?order_status=completed&page_size=50')
      setOrders(res.orders)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (showCreate) loadOrders() }, [showCreate, loadOrders])

  const selectedOrder = orders.find(o => o.id === orderId)

  const createReturn = async () => {
    const items = Object.entries(windowItems)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity: Number(quantity) }))
    if (!orderId || items.length === 0) { setMessage('Select an order and at least one item quantity'); return }
    setCreating(true)
    try {
      await jfetch('/api/returns', {
        method: 'POST',
        body: JSON.stringify({ orderId, items, reason }),
      })
      setMessage('Return request created')
      setShowCreate(false)
      setWindowItems({})
      setReason('')
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const runAction = async (ret: ReturnView, action: string) => {
    try {
      await jfetch(`/api/returns/${ret.id}`, { method: 'POST', body: JSON.stringify({ action }) })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const initiateRefund = async (refundId: string) => {
    try {
      await jfetch(`/api/refunds/${refundId}/initiate`, { method: 'POST' })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns &amp; Refunds</h1>
          <p className="text-sm text-gray-500">Approve, pick up, receive, and refund customer returns.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-xl bg-charcoal px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> New Return
        </button>
      </div>

      {message && <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600">
        <span>{message}</span>
        <button onClick={() => setMessage('')}><X className="h-4 w-4 text-gray-400" /></button>
      </div>}

      {showCreate && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700">New Return Request</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-charcoal"><X className="h-4 w-4" /></button>
            </div>
            <select value={orderId} onChange={e => { setOrderId(e.target.value); setWindowItems({}) }}
              className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-charcoal">
              <option value="">Select an order…</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
            </select>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (e.g. wrong size)"
              className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-charcoal" />
            <button onClick={createReturn} disabled={creating}
              className="w-full rounded-xl bg-charcoal px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {creating ? 'Creating…' : 'Create Return'}
            </button>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-700">Items to Return</h2>
            {!selectedOrder ? (
              <p className="py-8 text-center text-sm text-gray-400">Pick an order to see its items.</p>
            ) : (
              <div className="space-y-2">
                {selectedOrder.order_items.filter(i => i.quantity_fulfilled > (i.quantity_returned + i.quantity_cancelled)).map(item => {
                  const available = Math.min(item.quantity_fulfilled - item.quantity_returned, item.quantity_ordered - item.quantity_cancelled - item.quantity_returned)
                  if (available <= 0) return null
                  return (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{item.product_name_snapshot}</p>
                        <p className="text-xs text-gray-400">max {available}</p>
                      </div>
                      <input type="number" min={0} max={available} value={windowItems[item.id] ?? 0}
                        onChange={e => setWindowItems({ ...windowItems, [item.id]: Number(e.target.value) })}
                        className="w-20 rounded-xl border border-gray-200 px-3 py-1.5 text-center text-sm outline-none focus:border-charcoal" />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {returns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/40 py-16 text-center">
          <p className="text-sm text-gray-400">No returns yet. Create one from an order.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {returns.map(ret => (
            <div key={ret.id} className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-700">{ret.returnNumber}</p>
                  <p className="text-xs text-gray-400">{ret.order.orderNumber} · {new Date(ret.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge tone={statusTone(ret.status)}>{STATUS_LABELS[ret.status] ?? ret.status}</Badge>
              </div>
              <div className="mb-3 space-y-1">
                {ret.items.map(item => (
                  <div key={item.id} className="flex justify-between text-xs">
                    <span className="text-gray-600">{item.orderItem.productNameSnapshot}</span>
                    <span className="text-gray-400">×{item.quantity}</span>
                  </div>
                ))}
              </div>
              {ret.reason && <p className="mb-3 text-xs text-gray-400">Reason: {ret.reason}</p>}
              <div className="flex flex-wrap gap-1.5">
                {RETURN_ACTIONS.filter(a => {
                  if (a.action === 'approve' || a.action === 'reject') return ret.status === 'requested'
                  if (a.action === 'schedule_pickup') return ret.status === 'approved'
                  if (a.action === 'mark_transit') return ret.status === 'return_pickup_scheduled'
                  if (a.action === 'mark_received') return ret.status === 'return_in_transit'
                  return false
                }).map(a => (
                  <button key={a.action} onClick={() => runAction(ret, a.action)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                      a.tone === 'green' ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                      : a.tone === 'red' ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-gray-200 text-gray-600 hover:text-charcoal'}`}>
                    {a.label}
                  </button>
                ))}
                {ret.status === 'refund_pending' && ret.refunds.map(refund => (
                  <button key={refund.id} onClick={() => initiateRefund(refund.id)}
                    className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100">
                    Initiate refund
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}