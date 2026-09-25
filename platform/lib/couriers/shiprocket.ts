import type {
  CourierCredentials,
  CourierProvider,
  CourierProviderName,
  CreateReturnShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  SchedulePickupInput,
  SchedulePickupResult,
  ShipmentStatusResult,
  SupportedCourierInfo,
  TrackingEvent,
} from './provider'
import { verifyCourierWebhookSignature } from './signatures'
import { mapCourierStatusToPackageStatus } from './status-map'

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external'

/**
 * Shiprocket courier provider (live). Uses the Shiprocket v2 external API.
 *
 * Configuration is done per merchant via the Courier Integrations page; the
 * provider fetches credentials through a `getCredentials` callback supplied at
 * construction time so credentials never leave the server.
 *
 * NOTE: this is implemented against the documented Shiprocket v2 endpoints but
 * has not been exercised against a live account in this environment. Enable a
 * merchant's "test mode" connection with the mock provider to exercise the full
 * flow without an account.
 */
export class ShiprocketCourierProvider implements CourierProvider {
  readonly name: CourierProviderName = 'shiprocket'

  constructor(private credentials: CourierCredentials | null = null) {}

  private tokenCache: { token: string; expiresAt: number } | null = null

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string | null
  ): Promise<T> {
    const url = `${BASE_URL}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Shiprocket returned invalid JSON (${res.status})`)
    }
    if (!res.ok) {
      const message = (json.message as string) || (json.error as string) || `Shiprocket error ${res.status}`
      throw new Error(message)
    }
    return json as T
  }

  private async getToken(credentials: CourierCredentials): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token
    if (!credentials.email || !credentials.password) throw new Error('Shiprocket credentials missing (email/password)')
    const res = await this.request<{ token: string }>('POST', '/auth/login', {
      email: credentials.email,
      password: credentials.password,
    })
    const token = res.token
    if (!token) throw new Error('Shiprocket login failed: no token returned')
    this.tokenCache = { token, expiresAt: Date.now() + 55 * 60 * 1000 }
    return token
  }

  private async auth(credentials: CourierCredentials): Promise<string> {
    if (credentials.apiToken) return credentials.apiToken
    return this.getToken(credentials)
  }

  async connectAccount(credentials: CourierCredentials): Promise<{ ok: boolean; error?: string; account?: Record<string, unknown> }> {
    try {
      const token = await this.getToken(credentials)
      return { ok: true, account: { provider: 'shiprocket', account_authenticated: true, token_provided: Boolean(token) } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Shiprocket connection failed' }
    }
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const credentials = await this.loadCredentials()
    const token = await this.auth(credentials)

    const r = input.recipient
    const courierId = input.courierPreference && input.courierPreference !== 'auto'
      ? Number(input.courierPreference.replace(/\D+/g, '')) || undefined
      : undefined

    const subTotal = input.items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)
    const orderBody: Record<string, unknown> = {
      order_id: `${input.orderNumber}_${input.requestId.slice(0, 12)}`,
      order_date: new Date().toISOString().slice(0, 10),
      request_id: input.requestId,
      pickup_location: String(credentials.pickupPostcode || 'default'),
      channel_id: 'toropay',
      comment: `ToroPay order ${input.orderNumber}`,
      billing_customer_name: r.name,
      billing_last_name: '',
      billing_address: r.address1 + (r.address2 ? `, ${r.address2}` : ''),
      billing_city: r.city,
      billing_state: r.state,
      billing_country: r.country || 'India',
      billing_email: r.email || '',
      billing_phone: r.phone,
      shipping_is_billing: true,
      order_items: input.items.map(i => ({
        name: i.name,
        sku: i.sku || i.name,
        units: i.quantity,
        selling_price: i.price ?? 0,
      })),
      payment_method: input.paymentMode === 'COD' ? 'COD' : 'Prepaid',
      sub_total: Math.round(subTotal * 100) / 100,
      weight: String(input.weightKg ?? 0.5),
      length: String(input.lengthCm ?? 10),
      breadth: String(input.breadthCm ?? 10),
      height: String(input.heightCm ?? 10),
    }
    if (input.collectOnDelivery != null) orderBody.cod_amount = input.collectOnDelivery

    const created = await this.request<Record<string, unknown>>('POST', '/shipments/create/forward/pickup', orderBody, token)
    const shipmentId = String(created.shipment_id || created.shipmentId || '')

    // Assign an AWB. Shipsrocket auto-assigns a courier when no courier_id is sent.
    const assigned = await this.request<Record<string, unknown>>('POST', '/courier/assign/awb', {
      shipment_id: Number(shipmentId),
      ...(courierId ? { courier_id: courierId } : {}),
    }, token).catch(() => null)

    const data = (assigned?.response as Record<string, unknown> | undefined) as Record<string, unknown> | undefined
    const awbNumber = String(data?.awb_code || assigned?.awb_code || created.awb_number || '')
    const labelUrl = String(data?.label_url || assigned?.label_url || '')
    const status = String(data?.is_return === true ? 'returned' : data?.status || 'shipped')

    return {
      providerShipmentId: shipmentId,
      awbNumber,
      courierName: String(data?.courier_name || 'Shiprocket'),
      trackingUrl: awbNumber ? `https://shiprocket.co/tracking/${awbNumber}` : null,
      labelUrl: labelUrl || null,
      pickupScheduledAt: created.pickup_scheduled_date ? new Date(String(created.pickup_scheduled_date)) : null,
      estimatedDeliveryAt: null,
      status: mapCourierStatusToPackageStatus(status),
      providerMetadata: {
        shipment_id: shipmentId,
        awb: awbNumber,
        order_id: created.order_id ?? input.orderNumber,
        courier_name: data?.courier_name || null,
      },
    }
  }

  private async loadCredentials(): Promise<CourierCredentials> {
    if (!this.credentials) throw new Error('Shiprocket credentials not loaded')
    return this.credentials
  }

  async cancelShipment(params: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null }): Promise<{ ok: boolean; error?: string }> {
    try {
      const credentials = await this.loadCredentials()
      const token = await this.auth(credentials)
      if (!params.providerShipmentId) return { ok: false, error: 'Shipment id required to cancel' }
      const res = await this.request<{ cancelled_awb_data?: Array<{ awb_code: string }>; request_errors?: unknown }>('POST', '/shipments/cancel', { shipment_id: [Number(params.providerShipmentId)] }, token)
      const cancelled = Boolean(res.cancelled_awb_data?.length && !res.request_errors)
      return { ok: cancelled, error: cancelled ? undefined : 'Shiprocket did not confirm cancellation' }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Shiprocket cancellation failed' }
    }
  }

  async getShipmentStatus(params: { awbNumber?: string | null; providerShipmentId?: string | null }): Promise<ShipmentStatusResult> {
    const credentials = await this.loadCredentials()
    const token = await this.auth(credentials)
    if (!params.awbNumber) return { status: 'not_shipped', events: [] }

    const res = await this.request<Record<string, unknown>>('GET', `/courier/track/awb/${encodeURIComponent(params.awbNumber)}`, undefined, token)
    const data = (res.tracking_data as Record<string, unknown> | undefined) || res

    const statusRaw = String(data.tracking_status || data.current_status || data.shipment_status || '')
    const mapped = mapCourierStatusToPackageStatus(statusRaw)
    const activities = this.extractActivities(data)
    const events: TrackingEvent[] = (activities ?? []).map(a => ({
      eventId: a.id ? String(a.id) : null,
      eventType: String(a.event_type || 'tracking'),
      label: String(a.status || 'Tracking update'),
      status: mapCourierStatusToPackageStatus(String(a.status || a.location_type || '')),
      location: a.location ? String(a.location) : null,
      at: a.date instanceof Date ? a.date : new Date(String(a.date || Date.now())),
    }))

    return {
      status: mapped,
      courierName: data.courier_name ? String(data.courier_name) : null,
      awbNumber: String(data.awb_code || data.awb || params.awbNumber),
      trackingUrl: params.awbNumber ? `https://shiprocket.co/tracking/${params.awbNumber}` : null,
      estimatedDeliveryAt: data.estimated_delivery_date ? new Date(String(data.estimated_delivery_date)) : null,
      rtoInitiated: mapped === 'returned' && String(data.shipment_type || '').toUpperCase().includes('RTO'),
      rtoDelivered: mapped === 'returned' && String(data.current_status || '').toLowerCase().includes('delivered'),
      returnTrackingNumber: null,
      events,
      providerMetadata: { raw: data },
    }
  }

  private extractActivities(data: Record<string, unknown>): Array<Record<string, unknown>> | null {
    if (Array.isArray(data.activities)) return data.activities as Array<Record<string, unknown>>
    if (Array.isArray(data.tracking_data)) return data.tracking_data as Array<Record<string, unknown>>
    // Shiprocket sometimes nests under `tracking` or as a flat object.
    const nested = data as Record<string, unknown>
    if (nested.tracking && Array.isArray(nested.tracking)) return nested.tracking as Array<Record<string, unknown>>
    return null
  }

  async getTrackingEvents(params: { awbNumber?: string | null; providerShipmentId?: string | null }): Promise<TrackingEvent[]> {
    const status = await this.getShipmentStatus(params)
    return status.events
  }

  verifyWebhookSignature(params: { rawBody: string; signature: string | null; secret: string }): boolean {
    return verifyCourierWebhookSignature(params)
  }

  async generateLabel(params: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null }): Promise<{ labelUrl: string; contentType: string }> {
    const credentials = await this.loadCredentials()
    const token = await this.auth(credentials)
    if (!params.providerShipmentId) throw new Error('Shipment id required to generate label')
    const res = await this.request<{ label_url?: string }>('GET', `/courier/generate/label/${params.providerShipmentId}`, undefined, token)
    if (!res.label_url) throw new Error('Shiprocket did not return a label url')
    return { labelUrl: res.label_url, contentType: 'application/pdf' }
  }

  async schedulePickup(input: SchedulePickupInput): Promise<SchedulePickupResult> {
    const credentials = await this.loadCredentials()
    const token = await this.auth(credentials)
    if (!input.providerShipmentId) throw new Error('Shipment id required to schedule pickup')
    const dateStr = input.pickupDate.toISOString().slice(0, 10)
    const res = await this.request<{ pickup_scheduled_date?: string; pickup_token_number?: string }>('POST', '/courier/generate/pickup', {
      shipment_id: Number(input.providerShipmentId),
      pickup_date: dateStr,
      ...(input.pickupTime ? { pickup_time: input.pickupTime } : {}),
    }, token)
    return {
      pickupScheduledAt: res.pickup_scheduled_date ? new Date(res.pickup_scheduled_date) : input.pickupDate,
      pickupToken: res.pickup_token_number ?? null,
    }
  }

  async createReturnShipment(input: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null; reason?: string | null }): Promise<CreateReturnShipmentResult> {
    const credentials = await this.loadCredentials()
    const token = await this.auth(credentials)
    if (!input.providerShipmentId) throw new Error('Shipment id required to create a return')
    const res = await this.request<{ return_shipment_id?: string; return_awb?: string; shipment_id?: string; awb_code?: string }>('POST', '/shipments/create/return', {
      order_id: input.providerShipmentId,
      comment: input.reason ? `RTO: ${input.reason}` : 'RTO',
    }, token)
    return {
      returnProviderShipmentId: res.return_shipment_id ? String(res.return_shipment_id) : null,
      returnAwbNumber: res.return_awb ? String(res.return_awb) : null,
      returnTrackingNumber: res.return_awb ? String(res.return_awb) : res.awb_code ? String(res.awb_code) : null,
    }
  }

  getSupportedCouriers(): SupportedCourierInfo[] {
    return [
      {
        id: 'shiprocket',
        name: 'Shiprocket',
        description: 'Auto-assigns the cheapest available courier (Delhivery, BlueDart, DTDC, Ekart, XpressBees and more) from a single dashboard. Supports labels, pickups and RTO.',
        credentialFields: [
          { key: 'email', label: 'Shiprocket account email', type: 'email', required: true, placeholder: 'you@company.com' },
          { key: 'password', label: 'Shiprocket account password', type: 'password', required: true, placeholder: '••••••••' },
          { key: 'pickupPostcode', label: 'Default pickup pincode', type: 'text', required: true, placeholder: '560001' },
        ],
        webhookUrl: '/api/webhooks/shipping/shiprocket',
        supportsLabel: true,
        supportsPickup: true,
        supportsRto: true,
      },
    ]
  }
}