// Phase 3 courier provider abstraction.
// Business logic must only ever depend on this interface — never on a specific courier SDK.

export type CourierProviderName = 'mock' | 'shiprocket' | 'delhivery'

export interface CourierCredentials {
  email?: string
  password?: string
  apiKey?: string
  apiToken?: string
  pickupPostcode?: string
  [key: string]: unknown
}

export interface CourierCredentialField {
  key: string
  label: string
  type: 'text' | 'password' | 'email'
  required: boolean
  placeholder?: string
}

export interface SupportedCourierInfo {
  id: CourierProviderName
  name: string
  description: string
  credentialFields: CourierCredentialField[]
  webhookUrl: string
  supportsLabel: boolean
  supportsPickup: boolean
  supportsRto: boolean
}

export interface CourierAddress {
  name: string
  phone: string
  email?: string | null
  address1: string
  address2?: string | null
  city: string
  state: string
  pincode: string
  country?: string
}

export interface ShipmentItem {
  name: string
  sku?: string | null
  quantity: number
  price?: number
}

export interface CreateShipmentInput {
  merchantId: string
  orderId: string
  orderNumber: string
  /** Merchant-supplied idempotency key. Duplicate calls with the same key are safe. */
  requestId: string
  recipient: CourierAddress
  items: ShipmentItem[]
  paymentMode: 'PREPAID' | 'COD'
  weightKg?: number
  lengthCm?: number
  breadthCm?: number
  heightCm?: number
  courierPreference?: string | null
  collectOnDelivery?: number | null
  pickupScheduledAt?: Date | null
}

export interface CreateShipmentResult {
  providerShipmentId: string
  awbNumber: string
  courierName: string
  trackingUrl?: string | null
  labelUrl?: string | null
  estimatedDeliveryAt?: Date | null
  pickupScheduledAt?: Date | null
  status: string
  providerMetadata?: Record<string, unknown>
}

export interface TrackingEvent {
  eventId?: string | null
  eventType: string
  label: string
  /** Mapped status — one of the app PackageStatus values. */
  status: string
  location?: string | null
  at: Date
  raw?: unknown
}

export interface ShipmentStatusResult {
  /** Mapped status: not_shipped | shipped | in_transit | out_for_delivery | delivered | delivery_failed | returned */
  status: string
  courierName?: string | null
  awbNumber?: string | null
  trackingUrl?: string | null
  estimatedDeliveryAt?: Date | null
  rtoInitiated?: boolean
  rtoDelivered?: boolean
  returnTrackingNumber?: string | null
  events: TrackingEvent[]
  providerMetadata?: Record<string, unknown>
}

export interface SchedulePickupInput {
  merchantId: string
  providerShipmentId?: string | null
  awbNumber?: string | null
  pickupDate: Date
  pickupTime?: string | null
  address?: Partial<CourierAddress>
}

export interface SchedulePickupResult {
  pickupScheduledAt: Date
  pickupToken?: string | null
  providerMetadata?: Record<string, unknown>
}

export interface CreateReturnShipmentInput {
  merchantId: string
  providerShipmentId?: string | null
  awbNumber?: string | null
  origin?: Partial<CourierAddress>
  destination?: Partial<CourierAddress>
  reason?: string | null
}

export interface CreateReturnShipmentResult {
  returnProviderShipmentId?: string | null
  returnAwbNumber?: string | null
  returnTrackingNumber?: string | null
  providerMetadata?: Record<string, unknown>
}

export interface CourierProvider {
  readonly name: CourierProviderName
  connectAccount(credentials: CourierCredentials): Promise<{ ok: boolean; error?: string; account?: Record<string, unknown> }>
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>
  cancelShipment(params: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null }): Promise<{ ok: boolean; error?: string }>
  getShipmentStatus(params: { awbNumber?: string | null; providerShipmentId?: string | null }): Promise<ShipmentStatusResult>
  getTrackingEvents(params: { awbNumber?: string | null; providerShipmentId?: string | null }): Promise<TrackingEvent[]>
  verifyWebhookSignature(params: { rawBody: string; signature: string | null; secret: string }): boolean
  generateLabel(params: { merchantId: string; providerShipmentId?: string | null; awbNumber?: string | null }): Promise<{ labelUrl: string; contentType: string; data?: string }>
  schedulePickup(input: SchedulePickupInput): Promise<SchedulePickupResult>
  createReturnShipment(input: CreateReturnShipmentInput): Promise<CreateReturnShipmentResult>
  getSupportedCouriers(): SupportedCourierInfo[]
}