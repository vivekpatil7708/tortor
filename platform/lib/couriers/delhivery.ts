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

const NOT_READY = 'Delhivery is a placeholder provider in this release. Connect the mock courier (test) or Shiprocket (live) instead.'

/**
 * Placeholder Delhivery provider. The contract is implemented so the UI and
 * service layer can treat it like any other courier, but every operational call
 * fails with a clear "not available" error until the full connector ships.
 */
export class DelhiveryCourierProvider implements CourierProvider {
  readonly name: CourierProviderName = 'delhivery'

  async connectAccount(credentials: CourierCredentials): Promise<{ ok: boolean; error?: string; account?: Record<string, unknown> }> {
    return { ok: false, error: NOT_READY }
  }

  async createShipment(_input: CreateShipmentInput): Promise<CreateShipmentResult> {
    throw new Error(NOT_READY)
  }

  async cancelShipment(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: NOT_READY }
  }

  async getShipmentStatus(): Promise<ShipmentStatusResult> {
    throw new Error(NOT_READY)
  }

  async getTrackingEvents(): Promise<TrackingEvent[]> {
    throw new Error(NOT_READY)
  }

  verifyWebhookSignature(params: { rawBody: string; signature: string | null; secret: string }): boolean {
    return verifyCourierWebhookSignature(params)
  }

  async generateLabel(): Promise<{ labelUrl: string; contentType: string }> {
    throw new Error(NOT_READY)
  }

  async schedulePickup(): Promise<SchedulePickupResult> {
    throw new Error(NOT_READY)
  }

  async createReturnShipment(): Promise<CreateReturnShipmentResult> {
    throw new Error(NOT_READY)
  }

  getSupportedCouriers(): SupportedCourierInfo[] {
    return [
      {
        id: 'delhivery',
        name: 'Delhivery',
        description: 'Placeholder — coming soon. For now use Shiprocket (which routes Delhivery shipments) or the built-in mock courier.',
        credentialFields: [
          { key: 'apiKey', label: 'Delhivery API key', type: 'password', required: true, placeholder: '••••••••' },
          { key: 'apiToken', label: 'Delhivery API token', type: 'password', required: true, placeholder: '••••••••' },
        ],
        webhookUrl: '/api/webhooks/shipping/delhivery',
        supportsLabel: false,
        supportsPickup: false,
        supportsRto: false,
      },
    ]
  }
}