import { nanoid } from 'nanoid'
import type {
  CourierProvider,
  CourierProviderName,
  CreateReturnShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  CourierAddress,
  SchedulePickupInput,
  SchedulePickupResult,
  ShipmentStatusResult,
  SupportedCourierInfo,
  TrackingEvent,
} from './provider'
import { verifyCourierWebhookSignature, signCourierWebhook } from './signatures'
import { mapCourierStatusToPackageStatus } from './status-map'

interface MockShipmentRecord {
  requestId: string
  providerShipmentId: string
  awbNumber: string
  courierName: string
  orderNumber: string
  trackingUrl: string
  labelUrl: string
  status: string
  estimatedDeliveryAt?: Date | null
  pickupScheduledAt?: Date | null
  events: TrackingEvent[]
  createdAt: Date
  metadata: Record<string, unknown>
}

/**
 * Offline/simulated courier provider used by default, in test mode, and when a
 * merchant has not connected a real courier. Shipments, labels, pickups and
 * tracking events are simulated in memory; webhooks are signed/verified exactly
 * like a real provider so the full integration can be exercised without an
 * external account.
 */
export class MockCourierProvider implements CourierProvider {
  readonly name: CourierProviderName = 'mock'

  // merchantId -> (requestId | awb | providerShipmentId -> record)
  private records = new Map<string, Map<string, MockShipmentRecord>>()

  private index(merchantId: string): Map<string, MockShipmentRecord> {
    let map = this.records.get(merchantId)
    if (!map) {
      map = new Map()
      this.records.set(merchantId, map)
    }
    return map
  }

  reset(merchantId?: string): void {
    if (merchantId) this.records.delete(merchantId)
    else this.records.clear()
  }

  private key(record: MockShipmentRecord): string[] {
    return [record.requestId, record.providerShipmentId, record.awbNumber]
  }

  private find(merchantId: string, ref?: { requestId?: string | null; providerShipmentId?: string | null; awbNumber?: string | null }): MockShipmentRecord | null {
    if (!ref) return null
    const map = this.index(merchantId)
    const candidates = [ref.requestId, ref.providerShipmentId, ref.awbNumber].filter(Boolean) as string[]
    for (const c of candidates) {
      const hit = map.get(c)
      if (hit) return hit
    }
    return null
  }

  private store(merchantId: string, record: MockShipmentRecord): void {
    const map = this.index(merchantId)
    for (const k of this.key(record)) map.set(k, record)
  }

  async connectAccount(credentials: Record<string, unknown>): Promise<{ ok: boolean; error?: string; account?: Record<string, unknown> }> {
    if (credentials.email && typeof credentials.email === 'string' && !credentials.email.includes('@')) {
      return { ok: false, error: 'Invalid email address' }
    }
    return { ok: true, account: { provider: 'mock', mode: 'test', business_name: credentials.accountName || 'Mock Courier' } }
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const map = this.index(input.merchantId)
    const existing = map.get(input.requestId)
    if (existing) {
      return this.toResult(existing)
    }

    const now = new Date()
    const providerShipmentId = `mock_sh_${nanoid(10)}`
    const awbNumber = `MOCK${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${nanoid(10).toUpperCase().replace(/[^A-Z0-9]/g, '')}`
    const pickupScheduledAt = input.pickupScheduledAt ?? new Date(now.getTime() + 3 * 60 * 60 * 1000)
    const estimatedDeliveryAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)

    const events: TrackingEvent[] = [
      {
        eventId: `mock_evt_${nanoid(10)}`,
        eventType: 'shipment.created',
        label: 'Shipment created',
        status: 'shipped',
        location: input.recipient.city || 'Origin hub',
        at: now,
      },
    ]

    const record: MockShipmentRecord = {
      requestId: input.requestId,
      providerShipmentId,
      awbNumber,
      courierName: 'Mock Express',
      orderNumber: input.orderNumber,
      trackingUrl: `https://mock.courier.toropay.in/track/${awbNumber}`,
      labelUrl: `https://mock.courier.toropay.in/label/${awbNumber}.pdf`,
      status: 'shipped',
      estimatedDeliveryAt,
      pickupScheduledAt,
      events,
      createdAt: now,
      metadata: {
        order_id: input.orderId,
        order_number: input.orderNumber,
        payment_mode: input.paymentMode,
        weight_kg: input.weightKg ?? null,
        request_id: input.requestId,
      },
    }

    this.store(input.merchantId, record)
    return this.toResult(record)
  }

  private toResult(record: MockShipmentRecord): CreateShipmentResult {
    return {
      providerShipmentId: record.providerShipmentId,
      awbNumber: record.awbNumber,
      courierName: record.courierName,
      trackingUrl: record.trackingUrl,
      labelUrl: record.labelUrl,
      estimatedDeliveryAt: record.estimatedDeliveryAt ?? null,
      pickupScheduledAt: record.pickupScheduledAt ?? null,
      status: record.status,
      providerMetadata: { ...record.metadata, events: record.events.length },
    }
  }

  async cancelShipment(params: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null }): Promise<{ ok: boolean; error?: string }> {
    const record = this.find(params.merchantId, params)
    if (!record) return { ok: false, error: 'Shipment not found in mock provider' }
    record.status = 'cancelled'
    record.events.push({
      eventId: `mock_evt_${nanoid(10)}`,
      eventType: 'shipment.cancelled',
      label: 'Shipment cancelled',
      status: 'cancelled',
      location: null,
      at: new Date(),
    })
    return { ok: true }
  }

  async getShipmentStatus(params: { awbNumber?: string | null; providerShipmentId?: string | null; merchantId?: string }): Promise<ShipmentStatusResult> {
    // The interface omits merchantId, so we scan all merchants (test/dev only).
    for (const map of Array.from(this.records.values())) {
      const candidates = [params.awbNumber, params.providerShipmentId].filter(Boolean) as string[]
      for (const c of candidates) {
        const record = map.get(c)
        if (record) return this.toStatus(record)
      }
    }
    return { status: 'not_shipped', events: [] }
  }

  private toStatus(record: MockShipmentRecord): ShipmentStatusResult {
    return {
      status: record.status,
      courierName: record.courierName,
      awbNumber: record.awbNumber,
      trackingUrl: record.trackingUrl,
      estimatedDeliveryAt: record.estimatedDeliveryAt ?? null,
      rtoInitiated: record.events.some(e => e.eventType === 'shipment.rto_initiated'),
      rtoDelivered: record.events.some(e => e.eventType === 'shipment.rto_delivered'),
      returnTrackingNumber: record.metadata.return_tracking_number ? String(record.metadata.return_tracking_number) : null,
      events: [...record.events].sort((a, b) => a.at.getTime() - b.at.getTime()),
      providerMetadata: record.metadata,
    }
  }

  async getTrackingEvents(params: { awbNumber?: string | null; providerShipmentId?: string | null }): Promise<TrackingEvent[]> {
    const status = await this.getShipmentStatus(params)
    return status.events
  }

  verifyWebhookSignature(params: { rawBody: string; signature: string | null; secret: string }): boolean {
    return verifyCourierWebhookSignature(params)
  }

  signWebhook(rawBody: string, secret: string): string {
    return signCourierWebhook(rawBody, secret)
  }

  async generateLabel(params: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null }): Promise<{ labelUrl: string; contentType: string }> {
    const record = this.find(params.merchantId, params)
    if (!record) return { labelUrl: '', contentType: 'application/pdf' }
    return { labelUrl: `https://mock.courier.toropay.in/label/${record.awbNumber}.pdf`, contentType: 'application/pdf' }
  }

  async schedulePickup(input: SchedulePickupInput): Promise<SchedulePickupResult> {
    const record = this.find(input.merchantId, input)
    if (!record) throw new Error('Shipment not found in mock provider')
    record.pickupScheduledAt = input.pickupDate
    record.events.push({
      eventId: `mock_evt_${nanoid(10)}`,
      eventType: 'shipment.pickup_scheduled',
      label: `Pickup scheduled for ${input.pickupDate.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      status: 'shipped',
      location: input.address?.city ?? null,
      at: new Date(),
    })
    return { pickupScheduledAt: input.pickupDate, pickupToken: `pick_${nanoid(8)}` }
  }

  async createReturnShipment(input: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null; reason?: string | null }): Promise<CreateReturnShipmentResult> {
    const record = this.find(input.merchantId, input)
    if (!record) throw new Error('Shipment not found in mock provider')
    const returnAwb = `RMOCK${nanoid(10).toUpperCase().replace(/[^A-Z0-9]/g, '')}`
    record.status = 'returned'
    record.metadata.return_tracking_number = returnAwb
    record.events.push({
      eventId: `mock_evt_${nanoid(10)}`,
      eventType: 'shipment.rto_initiated',
      label: input.reason ? `RTO initiated: ${input.reason}` : 'RTO initiated',
      status: 'returned',
      location: null,
      at: new Date(),
    })
    return { returnProviderShipmentId: `mock_ret_${nanoid(10)}`, returnAwbNumber: returnAwb, returnTrackingNumber: returnAwb, providerMetadata: { awb: record.awbNumber } }
  }

  getSupportedCouriers(): SupportedCourierInfo[] {
    return [
      {
        id: 'mock',
        name: 'Mock Courier (test mode)',
        description: 'Built-in simulator. Creates shipments, labels and tracking events locally — no credentials or live account needed.',
        credentialFields: [
          { key: 'accountName', label: 'Account name', type: 'text', required: false, placeholder: 'My Store' },
        ],
        webhookUrl: '/api/webhooks/shipping/mock',
        supportsLabel: true,
        supportsPickup: true,
        supportsRto: true,
      },
    ]
  }

  // ---- test/demo helpers ----------------------------------------------------

  /** Simulate the courier pushing an event for a shipment and return the payload a webhook would carry. */
  pushEvent(
    merchantId: string,
    ref: { requestId?: string | null; providerShipmentId?: string | null; awbNumber?: string | null },
    event: {
      eventType: string
      label: string
      status: string // app PackageStatus value
      location?: string | null
      at?: Date | null
    }
  ): { record: MockShipmentRecord; webhookPayload: Record<string, unknown> } | null {
    const record = this.find(merchantId, ref)
    if (!record) return null
    const at = event.at ?? new Date()
    const mapped = mapCourierStatusToPackageStatus(event.status)
    record.status = mapped
    const trackingEvent: TrackingEvent = {
      eventId: `mock_evt_${nanoid(10)}`,
      eventType: event.eventType,
      label: event.label,
      status: mapped,
      location: event.location ?? null,
      at,
    }
    record.events.push(trackingEvent)
    const webhookPayload = {
      event: event.eventType,
      event_id: trackingEvent.eventId,
      shipment: {
        shipment_id: record.providerShipmentId,
        awb_number: record.awbNumber,
        order_number: record.orderNumber,
        status: mapped,
        label: event.label,
        location: event.location ?? null,
        occurred_at: at.toISOString(),
      },
    }
    return { record, webhookPayload }
  }

  getRecord(merchantId: string, ref: { requestId?: string | null; providerShipmentId?: string | null; awbNumber?: string | null }): MockShipmentRecord | null {
    return this.find(merchantId, ref)
  }
}

export function mockRecipient(): CourierAddress {
  return {
    name: 'Ravi Sharma',
    phone: '+919876543210',
    email: 'ravi@example.com',
    address1: '221 Green Park Main',
    address2: '3rd Floor',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110016',
    country: 'India',
  }
}