import type { CourierCredentials, CourierProvider, CourierProviderName } from './provider'
import { MockCourierProvider } from './mock'
import { ShiprocketCourierProvider } from './shiprocket'
import { DelhiveryCourierProvider } from './delhivery'

/**
 * Resolve a courier provider by name. Live providers return a new instance each
 * call so credentials (and token caches) are scoped to a single operation and
 * never shared across merchants. The mock provider is a singleton: its in-memory
 * shipments, labels and tracking events must survive across calls so that
 * status sync, labels, pickups, cancellations and webhooks keep working.
 */
let mockSingleton: MockCourierProvider | null = null

export function getCourierProvider(name: CourierProviderName, credentials?: CourierCredentials): CourierProvider {
  switch (name) {
    case 'shiprocket':
      return new ShiprocketCourierProvider(credentials ?? null)
    case 'delhivery':
      return new DelhiveryCourierProvider()
    default:
      if (!mockSingleton) mockSingleton = new MockCourierProvider()
      return mockSingleton
  }
}

export { mockRecipient } from './mock'
export { mapCourierStatusToPackageStatus, evaluateCourierTransition, PACKAGE_STATUSES } from './status-map'
export { signCourierWebhook, verifyCourierWebhookSignature } from './signatures'
export { encryptSecret, decryptSecret, encryptJson, decryptJson } from './crypto'
export type {
  CourierProvider,
  CourierProviderName,
  CourierCredentials,
  CourierCredentialField,
  SupportedCourierInfo,
  CourierAddress,
  ShipmentItem,
  CreateShipmentInput,
  CreateShipmentResult,
  TrackingEvent,
  ShipmentStatusResult,
  SchedulePickupInput,
  SchedulePickupResult,
  CreateReturnShipmentInput,
  CreateReturnShipmentResult,
} from './provider'