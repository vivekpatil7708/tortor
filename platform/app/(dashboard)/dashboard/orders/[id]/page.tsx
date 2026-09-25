'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Dialog, ConfirmDialog } from '@/components/ui/dialog'
import { formatMoney, formatDateTime, humanize, ORDER_SOURCES, FULFILLMENT_TYPES } from '@/lib/ui-format'
import {
  ArrowLeft, Pencil, Plus, Truck, Package, X, CheckCircle2,
} from 'lucide-react'

type Order = any

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [actionBusy, setActionBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  // status patch dialog
  const [patchOpen, setPatchOpen] = useState(false)
  const [patchType, setPatchType] = useState<'order_status' | 'payment_status'>('order_status')
  const [patchValue, setPatchValue] = useState('')

  // cancel dialog
  const [cancelOpen, setCancelOpen] = useState(false)

  // fulfillment dialog
  const [fullOpen, setFullOpen] = useState(false)
  const [fullType, setFullType] = useState('shipping')
  const [fullItems, setFullItems] = useState<Record<string, number>>({})
  const [shippedAt, setShippedAt] = useState('')

  // courier shipping (Phase 3)
  const [shipViaCourier, setShipViaCourier] = useState(true)
  const [courierProvider, setCourierProvider] = useState('auto')
  const [courierAction, setCourierAction] = useState<{ pkg: any; action: 'cancel' | 'return' } | null>(null)

  // tracking dialog
  const [trackFor, setTrackFor] = useState<{ fulfillmentId: string; packageId: string } | null>(null)
  const [trkCourier, setTrkCourier] = useState('')
  const [trkNumber, setTrkNumber] = useState('')
  const [trkUrl, setTrkUrl] = useState('')

  // package status dialog
  const [pkgStatusFor, setPkgStatusFor] = useState<{ fulfillmentId: string; packageId: string } | null>(null)
  const [pkgStatus, setPkgStatus] = useState('in_transit')
  const [pkgLocation, setPkgLocation] = useState('')

  // shipment event dialog
  const [eventFor, setEventFor] = useState<{ fulfillmentId: string; packageId: string } | null>(null)
  const [evLabel, setEvLabel] = useState('')
  const [evStatus, setEvStatus] = useState('info')
  const [evLocation, setEvLocation] = useState('')
  const [evAt, setEvAt] = useState('')

  function load() {
    setLoading(true)
    api.getOrder(id)
      .then(r => setOrder(r.order))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const message = (txt: string) => {
    setActionMsg(txt)
    setTimeout(() => setActionMsg(''), 3000)
  }

  const items = useMemo(() => order?.orderItems ?? [], [order])

  function toggleItem(itemId: string, remaining: number) {
    setFullItems(prev => {
      const next = { ...prev }
      if (next[itemId] !== undefined) {
        delete next[itemId]
      } else {
        next[itemId] = remaining
      }
      return next
    })
  }

  function changeQty(itemId: string, max: number, v: string) {
    const n = Math.min(Math.max(parseInt(v || '1', 10) || 1, 1), Math.max(1, max))
    setFullItems(prev => ({ ...prev, [itemId]: n }))
  }

  async function openStatusPatch(type: 'order_status' | 'payment_status') {
    setPatchType(type)
    setPatchValue('')
    setPatchOpen(true)
  }

  async function patchStatus() {
    if (!patchValue) return
    setActionBusy(true)
    try {
      await api.updateOrder(order.id, { type: patchType, status: patchValue })
      setPatchOpen(false)
      message('Status updated')
      load()
    } catch (e) {
      message((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function confirmCancel() {
    setActionBusy(true)
    try {
      await api.cancelOrder(order.id, { reason: 'Cancelled from dashboard' })
      setCancelOpen(false)
      message('Order cancelled')
      load()
    } catch (e) {
      message((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function createFulfillment() {
    const entries = Object.entries(fullItems)
    if (entries.length === 0) { message('Select at least one item to fulfill'); return }
    setActionBusy(true)
    try {
      const body: any = {
        fulfillment_type: fullType,
        items: entries.map(([itemId, quantity]) => ({ order_item_id: itemId, quantity })),
      }
      if (shipViaCourier) {
        body.courier_provider = courierProvider && courierProvider !== 'auto' ? courierProvider : null
        body.payment_mode = order.paymentStatus === 'pending' ? 'COD' : 'PREPAID'
        const res = await api.createProviderShipment(order.id, body)
        const tracking = res.package?.trackingNumber || res.package?.awbNumber
        setFullOpen(false)
        setFullItems({})
        setShippedAt('')
        message(`Shipment created${tracking ? ` · #${tracking}` : ''}`)
        load()
        return
      }
      if (shippedAt) body.shipped_at = new Date(shippedAt).toISOString()
      const res = await api.createFulfillment(order.id, body)
      setFullOpen(false)
      setFullItems({})
      setShippedAt('')
      message(`Fulfillment ${res.fulfillment.fulfillmentNumber} created`)
      load()
    } catch (e) {
      message((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function runCourierAction(pkg: any, action: 'label' | 'sync' | 'pickup' | 'cancel' | 'return') {
    setActionBusy(true)
    try {
      const res = await api.courierPackageAction(pkg.id, {
        action,
        ...(action === 'pickup' ? { pickup_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } : {}),
      })
      if (action === 'label' && res.result?.label_url && typeof res.result.label_url === 'string') {
        window.open(res.result.label_url, '_blank', 'noopener,noreferrer')
      }
      setCourierAction(null)
      message(`${action === 'sync' ? 'Synced' : action === 'label' ? 'Label ready' : action} · done`)
      load()
    } catch (e) {
      message((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function saveTracking() {
    if (!trackFor || !trkNumber) { message('Tracking number is required'); return }
    setActionBusy(true)
    try {
      await api.addPackageTracking(trackFor.fulfillmentId, {
        type: 'tracking',
        package_id: trackFor.packageId,
        courier_provider: trkCourier,
        tracking_number: trkNumber,
        tracking_url: trkUrl,
      })
      setTrackFor(null)
      setTrkCourier(''); setTrkNumber(''); setTrkUrl('')
      message('Tracking saved')
      load()
    } catch (e) {
      message((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function savePackageStatus() {
    if (!pkgStatusFor) return
    setActionBusy(true)
    try {
      await api.setPackageStatus(pkgStatusFor.fulfillmentId, {
        type: 'package_status',
        package_id: pkgStatusFor.packageId,
        status: pkgStatus,
        location: pkgLocation || undefined,
      })
      setPkgStatusFor(null)
      setPkgStatus('in_transit')
      setPkgLocation('')
      message('Package status updated')
      load()
    } catch (e) {
      message((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function addEvent() {
    if (!eventFor || !evLabel) { message('Event label is required'); return }
    setActionBusy(true)
    try {
      await api.addShipmentEvent(eventFor.fulfillmentId, {
        package_id: eventFor.packageId,
        event_label: evLabel,
        event_status: evStatus,
        location: evLocation || undefined,
        event_at: evAt ? new Date(evAt).toISOString() : undefined,
      })
      setEventFor(null)
      setEvLabel(''); setEvStatus('info'); setEvLocation(''); setEvAt('')
      message('Event added')
      load()
    } catch (e) {
      message((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  if (loading && !order) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push('/dashboard/orders')} className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-charcoal">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </button>
        <EmptyState title="Order not found" description={error || 'This order does not exist.'} />
      </div>
    )
  }

  const shipping = order.shippingAddressSnapshot as Record<string, string> | null

  return (
    <div className="space-y-5">
      {actionMsg && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{actionMsg}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/orders')} className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold">{order.orderNumber}</h1>
              <Badge>{order.orderStatus}</Badge>
              <Badge>{order.paymentStatus}</Badge>
            </div>
            <p className="text-sm text-gray-500">
              {ORDER_SOURCES[order.source] ?? humanize(order.source)} · {formatDateTime(order.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFullOpen(true)} disabled={order.orderStatus === 'cancelled'} className="flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90">
            <Truck className="h-4 w-4" /> Create fulfillment
          </button>
          <button onClick={() => openStatusPatch('order_status')} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
            Change status
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: items, fulfillment, timeline */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <h3 className="font-bold">Items</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-3 font-semibold">Product</th>
                    <th className="py-2 pr-3 font-semibold">SKU</th>
                    <th className="py-2 pr-3 text-right font-semibold">Unit</th>
                    <th className="py-2 pr-3 text-center font-semibold">Qty ordered</th>
                    <th className="py-2 pr-3 text-center font-semibold">Fulfilled</th>
                    <th className="py-2 text-right font-semibold">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.id} className="border-b border-gray-50">
                      <td className="py-3 pr-3 font-medium">{it.productNameSnapshot}</td>
                      <td className="py-3 pr-3 text-gray-500">{it.skuSnapshot}</td>
                      <td className="py-3 pr-3 text-right">{formatMoney(it.unitPrice, order.currency)}</td>
                      <td className="py-3 pr-3 text-center">{it.quantityOrdered}</td>
                      <td className="py-3 pr-3 text-center">{it.quantityFulfilled}</td>
                      <td className="py-3 text-right font-medium">{formatMoney(it.lineTotal, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatMoney(order.subtotalAmount, order.currency)}</span></div>
              {(order.discountAmount ?? 0) > 0 && <div className="flex justify-between text-gray-500"><span>Discount</span><span>−{formatMoney(order.discountAmount, order.currency)}</span></div>}
              <div className="flex justify-between text-gray-500"><span>Shipping</span><span>{formatMoney(order.shippingAmount, order.currency)}</span></div>
              {(order.taxAmount ?? 0) > 0 && <div className="flex justify-between text-gray-500"><span>Tax</span><span>{formatMoney(order.taxAmount, order.currency)}</span></div>}
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-extrabold">
                <span>Total</span><span>{formatMoney(order.totalAmount, order.currency)}</span>
              </div>
              {order.paidAt && <div className="flex justify-between text-xs text-gray-400"><span>Paid at</span><span>{formatDateTime(order.paidAt)}</span></div>}
              {order.cancelledAt && <div className="flex justify-between text-xs text-red-500"><span>Cancelled at</span><span>{formatDateTime(order.cancelledAt)}</span></div>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Fulfillments</h3>
              <Badge>{order.fulfillmentSummaryStatus}</Badge>
            </div>
            {order.fulfillments.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No fulfillments yet. Create one to start shipping this order.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {order.fulfillments.map((f: any) => (
                  <div key={f.id} className="rounded-2xl border border-gray-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{f.fulfillmentNumber}</span>
                        <Badge>{f.status}</Badge>
                        <span className="text-xs text-gray-400">{FULFILLMENT_TYPES[f.fulfillmentType] ?? humanize(f.fulfillmentType)}</span>
                      </div>
                      <span className="text-xs text-gray-400">{f.createdAt ? formatDateTime(f.createdAt) : '—'} · by {f.createdByRole ?? 'merchant'}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                      {f.items.map((fi: any) => (
                        <span key={fi.id} className="rounded-full bg-gray-100 px-2.5 py-1">
                          {fi.orderItem?.productNameSnapshot ?? 'Item'} × {fi.quantity}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 space-y-3">
                      {f.packages.map((pkg: any) => (
                        <div key={pkg.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              <Package className="h-4 w-4 text-gray-400" /> {pkg.trackingNumber ? `#${pkg.trackingNumber}` : 'No tracking yet'}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              <Badge>{pkg.packageStatus}</Badge>
                              <button onClick={() => setTrackFor({ fulfillmentId: f.id, packageId: pkg.id })} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-100">
                                {pkg.trackingNumber ? 'Edit tracking' : 'Add tracking'}
                              </button>
                              <button onClick={() => { setPkgStatusFor({ fulfillmentId: f.id, packageId: pkg.id }); setPkgStatus(pkg.packageStatus || 'in_transit') }} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-100">
                                Update status
                              </button>
                              <button onClick={() => setEventFor({ fulfillmentId: f.id, packageId: pkg.id })} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-100">
                                Add event
                              </button>
                              {pkg.provider && (
                                <>
                                  <button onClick={() => runCourierAction(pkg, 'label')} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-100">
                                    Label
                                  </button>
                                  <button onClick={() => runCourierAction(pkg, 'pickup')} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-100">
                                    Pickup
                                  </button>
                                  <button onClick={() => runCourierAction(pkg, 'sync')} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-100">
                                    Sync
                                  </button>
                                  <button onClick={() => setCourierAction({ pkg, action: 'cancel' })} className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                                    Cancel
                                  </button>
                                  <button onClick={() => setCourierAction({ pkg, action: 'return' })} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                                    RTO
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {pkg.courierProvider && (
                            <p className="mt-1 text-xs text-gray-500">{pkg.courierProvider}{pkg.provider && pkg.courierProvider !== pkg.provider ? ` (${pkg.provider})` : ''}</p>
                          )}
                          {pkg.awbNumber && pkg.awbNumber !== pkg.trackingNumber && (
                            <p className="mt-1 text-xs text-gray-400">AWB #{pkg.awbNumber}</p>
                          )}
                          {pkg.returnTrackingNumber && (
                            <p className="mt-1 text-xs font-semibold text-amber-600">Return tracking #{pkg.returnTrackingNumber}</p>
                          )}
                          {pkg.trackingUrl && (
                            <a href={pkg.trackingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-primary-600 hover:underline">
                              Open tracking page ↗
                            </a>
                          )}

                          {pkg.events.length > 0 && (
                            <ul className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                              {pkg.events.map((ev: any) => (
                                <li key={ev.id} className="flex items-start gap-2 text-xs">
                                  <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ev.eventStatus === 'delivered' ? 'text-green-500' : ev.eventStatus === 'delivery_failed' ? 'text-red-500' : 'text-gray-300'}`} />
                                  <div className="flex-1">
                                    <p className="font-semibold text-gray-700">{ev.eventLabel}</p>
                                    {ev.location && <p className="text-gray-500">{ev.location}</p>}
                                  </div>
                                  <span className="text-gray-400">{formatDateTime(ev.eventAt)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}

                      <button onClick={() => setFullOpen(true)} className="mt-1 flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-gray-500 hover:border-charcoal hover:text-charcoal">
                        <Plus className="h-3.5 w-3.5" /> Add more to this order
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-bold">Timeline</h3>
            {order.statusHistory.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No status changes recorded.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {[...order.statusHistory].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((h: any) => (
                  <li key={h.id} className="relative pl-5">
                    <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary-400" />
                    <p className="text-sm">
                      <span className="font-semibold">{humanize(h.statusType)}</span> changed from{' '}
                      <span className="font-medium text-gray-500">{h.previousStatus ? humanize(h.previousStatus) : '—'}</span> to{' '}
                      <span className="font-medium">{humanize(h.newStatus)}</span>
                    </p>
                    <p className="text-xs text-gray-400">{h.changeReason || 'No reason'}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(h.createdAt)} · by {h.changedByType}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Right: customer & address */}
        <div className="space-y-5">
          <Card>
            <h3 className="font-bold">Customer</h3>
            {order.customer ? (
              <>
                <p className="mt-2 font-semibold">{order.customer.fullName}</p>
                {order.customer.email && <p className="text-sm text-gray-500">{order.customer.email}</p>}
                <p className="text-sm text-gray-500">{order.customer.phone}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Walk-in / guest order</p>
            )}
          </Card>

          <Card>
            <h3 className="font-bold">Shipping address</h3>
            {shipping ? (
              <div className="mt-2 text-sm text-gray-700">
                <p className="font-semibold">{shipping.recipient_name}</p>
                <p>{shipping.phone}</p>
                <p>{shipping.line1}{shipping.line2 ? `, ${shipping.line2}` : ''}</p>
                <p>{shipping.city}, {shipping.state} — {shipping.pincode}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No shipping address.</p>
            )}
          </Card>

          <Card>
            <h3 className="font-bold">Actions</h3>
            <div className="mt-3 space-y-2">
              <button onClick={() => openStatusPatch('order_status')} className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                Update order status
              </button>
              <button onClick={() => openStatusPatch('payment_status')} className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                Update payment status
              </button>
              {order.orderStatus !== 'cancelled' && (
                <button onClick={() => setCancelOpen(true)} className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                  Cancel order
                </button>
              )}
            </div>
            {order.customerNote && (
              <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><span className="font-semibold">Customer note:</span> {order.customerNote}</p>
            )}
          </Card>
        </div>
      </div>

      {/* Status patch dialog */}
      <Dialog open={patchOpen} onClose={() => setPatchOpen(false)} title={patchType === 'order_status' ? 'Update order status' : 'Update payment status'}>
        <div className="space-y-4">
          <Field label="New status" required>
            <Select value={patchValue} onChange={e => setPatchValue(e.target.value)}>
              <option value="">Select…</option>
              {(patchType === 'order_status'
                ? ['new', 'processing', 'on_hold', 'completed']
                : ['pending', 'paid', 'failed', 'expired', 'refunded']
              ).map(s => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPatchOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={patchStatus} disabled={actionBusy} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {actionBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Create fulfillment dialog */}
      <Dialog open={fullOpen} onClose={() => setFullOpen(false)} title={`Create fulfillment — ${order.orderNumber}`} wide>
        <div className="space-y-4">
          <Field label="Fulfillment type">
            <Select value={fullType} onChange={e => setFullType(e.target.value)}>
              {Object.entries(FULFILLMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-600">Items to fulfill</p>
            <div className="space-y-2">
              {items.map((it: any) => {
                const remaining = it.quantityOrdered - it.quantityFulfilled
                const selected = fullItems[it.id] !== undefined
                return (
                  <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected} onChange={() => toggleItem(it.id, remaining)} className="h-4 w-4" />
                      <span className="font-medium">{it.productNameSnapshot}</span>
                      <span className="text-xs text-gray-400">({remaining} remaining)</span>
                    </label>
                    {selected && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Qty</span>
                        <Input type="number" min={1} max={remaining} value={fullItems[it.id]} onChange={e => changeQty(it.id, remaining, e.target.value)} className="w-20" />
                      </div>
                    )}
                  </div>
                )
              })}
              {items.length === 0 && <p className="text-sm text-gray-500">Order has no items (flat payment / service).</p>}
            </div>
          </div>

          <Field label="Shipping method">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-100 px-3 py-2.5 text-sm font-medium">
              <input type="checkbox" checked={shipViaCourier} onChange={e => setShipViaCourier(e.target.checked)} className="h-4 w-4" />
              Ship through a courier (auto tracking + AWB)
            </label>
          </Field>
          {shipViaCourier && (
            <Field label="Courier">
              <Select value={courierProvider} onChange={e => setCourierProvider(e.target.value)}>
                <option value="auto">Auto (best connected courier)</option>
                <option value="mock">Mock Courier (test mode)</option>
                <option value="shiprocket">Shiprocket</option>
              </Select>
            </Field>
          )}

          <Field label="Shipped at (manual only, optional)">
            <Input type="datetime-local" value={shippedAt} onChange={e => setShippedAt(e.target.value)} disabled={shipViaCourier} />
          </Field>

          <div className="flex justify-end gap-2">
            <button onClick={() => setFullOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={createFulfillment} disabled={actionBusy} className="flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Truck className="h-4 w-4" /> Create fulfillment
            </button>
          </div>
        </div>
      </Dialog>

      {/* Tracking dialog */}
      <Dialog open={!!trackFor} onClose={() => setTrackFor(null)} title="Tracking details">
        <div className="space-y-4">
          <Field label="Courier provider">
            <Select value={trkCourier} onChange={e => setTrkCourier(e.target.value)}>
              <option value="">Select…</option>
              {['Delhivery', 'BlueDart', 'DTDC', 'Ekart', 'Xpressbees', 'Shiprocket', 'India Post', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Tracking number" required>
            <Input value={trkNumber} onChange={e => setTrkNumber(e.target.value)} />
          </Field>
          <Field label="Tracking URL (optional)">
            <Input value={trkUrl} onChange={e => setTrkUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setTrackFor(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={saveTracking} disabled={actionBusy} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {actionBusy ? 'Saving…' : 'Save tracking'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Package status dialog */}
      <Dialog open={!!pkgStatusFor} onClose={() => setPkgStatusFor(null)} title="Update package status">
        <div className="space-y-4">
          <Field label="Package status" required>
            <Select value={pkgStatus} onChange={e => setPkgStatus(e.target.value)}>
              {['not_shipped', 'awaiting_pickup', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned_to_sender', 'on_hold'].map(s => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
          </Field>
          <Field label="Location (optional)">
            <Input value={pkgLocation} onChange={e => setPkgLocation(e.target.value)} placeholder="e.g. Bengaluru hub" />
          </Field>
          <p className="text-xs text-gray-500">Recording a manual event creates a shipment history entry for your customer.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPkgStatusFor(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={savePackageStatus} disabled={actionBusy} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {actionBusy ? 'Saving…' : 'Update'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Shipment event dialog */}
      <Dialog open={!!eventFor} onClose={() => setEventFor(null)} title="Add shipment event">
        <div className="space-y-4">
          <Field label="Event label" required>
            <Input value={evLabel} onChange={e => setEvLabel(e.target.value)} placeholder="e.g. Package out for delivery" />
          </Field>
          <Field label="Event status">
            <Select value={evStatus} onChange={e => setEvStatus(e.target.value)}>
              {['info', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].map(s => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
          </Field>
          <Field label="Location (optional)">
            <Input value={evLocation} onChange={e => setEvLocation(e.target.value)} />
          </Field>
          <Field label="Event time (optional)">
            <Input type="datetime-local" value={evAt} onChange={e => setEvAt(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEventFor(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button onClick={addEvent} disabled={actionBusy} className="rounded-xl bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {actionBusy ? 'Saving…' : 'Add event'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Courier cancel/RTO dialog */}
      <ConfirmDialog
        open={!!courierAction}
        onClose={() => setCourierAction(null)}
        onConfirm={() => courierAction && runCourierAction(courierAction.pkg, courierAction.action)}
        title={courierAction?.action === 'cancel' ? 'Cancel this shipment?' : 'Initiate a return?'}
        message={courierAction?.action === 'cancel'
          ? 'The courier will be asked to cancel this package. This is reversible only if the courier accepts the cancellation.'
          : 'An RTO shipment will be created to return this package to you.'}
        confirmLabel={courierAction?.action === 'cancel' ? 'Cancel shipment' : 'Start return'}
        danger={courierAction?.action === 'cancel'}
        busy={actionBusy}
      />

      {/* Cancel dialog */}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
        title="Cancel this order?"
        message="Cancelling will mark the order as cancelled. Paid amounts are not auto-refunded in Phase 1."
        confirmLabel="Cancel order"
        danger
        busy={actionBusy}
      />
    </div>
  )
}