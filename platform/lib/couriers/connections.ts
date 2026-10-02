import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import { getCourierProvider } from './index'
import { encryptJson, decryptJson, encryptSecret, decryptSecret } from './crypto'
import type { CourierCredentials, CourierProvider, CourierProviderName, SupportedCourierInfo } from './provider'
import type { CourierConnection, CourierConnectionStatus } from '@prisma/client'

export type { CourierConnectionStatus }

export function generateCourierWebhookSecret(): string {
  return `cwhsec_${nanoid(32)}`
}

function providerInstances(): CourierProvider[] {
  return [getCourierProvider('mock'), getCourierProvider('shiprocket'), getCourierProvider('delhivery')]
}

export function getSupportedCouriers(): SupportedCourierInfo[] {
  return providerInstances().flatMap(p => p.getSupportedCouriers())
}

/** Serialize a SupportedCourierInfo into the snake_case shape the dashboard consumes. */
export function serializeSupportedCourier(info: SupportedCourierInfo) {
  return {
    id: info.id,
    name: info.name,
    description: info.description,
    credential_fields: (info.credentialFields ?? []).map(f => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder ?? undefined,
    })),
    webhook_url: info.webhookUrl,
    supports_label: info.supportsLabel,
    supports_pickup: info.supportsPickup,
    supports_rto: info.supportsRto,
  }
}

export function getSupportedCourierInfo(name: string): SupportedCourierInfo | undefined {
  return getSupportedCouriers().find(c => c.id === name)
}

/** Save (or update) a courier connection. Mock always connects; live providers validate credentials. */
export async function saveCourierConnection(params: {
  merchantId: string
  provider: string
  label?: string | null
  testMode?: boolean
  credentials?: Record<string, unknown> | null
}): Promise<CourierConnection> {
  const { merchantId, provider } = params
  const name = provider as CourierProviderName
  const testMode = params.testMode ?? false

  let status: CourierConnectionStatus = testMode ? 'connected' : 'disconnected'
  let lastError: string | null = null
  let accountMetadata: Record<string, unknown> | null = null

  const providerInstance = getCourierProvider(name, (params.credentials ?? {}) as CourierCredentials)

  if (name !== 'mock' && !testMode) {
    const connected = await providerInstance.connectAccount((params.credentials ?? {}) as CourierCredentials)
    if (connected.ok) {
      status = 'connected'
      accountMetadata = connected.account ?? null
    } else {
      status = 'error'
      lastError = connected.error ?? 'Connection failed'
    }
  }

  const existing = await prisma.courierConnection.findUnique({
    where: { merchantId_provider: { merchantId, provider } },
  })

  const credentialsEnvelope = encryptJson(params.credentials ?? {})
  const webhookSecret = existing?.webhookSecretEncrypted
    ? existing.webhookSecretEncrypted
    : encryptSecret(generateCourierWebhookSecret())

  const data = {
    label: params.label ?? null,
    testMode,
    status,
    credentialsEncrypted: credentialsEnvelope,
    webhookSecretEncrypted: webhookSecret,
    lastTestedAt: status === 'connected' ? new Date() : existing?.lastTestedAt ?? null,
    lastError,
  }

  if (existing) {
    return prisma.courierConnection.update({ where: { id: existing.id }, data })
  }

  return prisma.courierConnection.create({
    data: { merchantId, provider, ...data },
  })
}

/** Re-validate an existing connection's credentials (e.g. from the UI "Test" button). */
export async function testCourierConnection(connectionId: string): Promise<{ ok: boolean; error?: string | null }> {
  const connection = await prisma.courierConnection.findUnique({ where: { id: connectionId } })
  if (!connection) return { ok: false, error: 'Connection not found' }
  if (connection.provider === 'mock') {
    await prisma.courierConnection.update({ where: { id: connectionId }, data: { lastTestedAt: new Date(), lastError: null, status: 'connected' } })
    return { ok: true, error: null }
  }
  const credentials = decryptJson<CourierCredentials>(connection.credentialsEncrypted)
  const provider = getCourierProvider(connection.provider as CourierProviderName, credentials)
  const result = await provider.connectAccount(credentials)
  await prisma.courierConnection.update({
    where: { id: connectionId },
    data: {
      lastTestedAt: new Date(),
      status: result.ok ? 'connected' : 'error',
      lastError: result.ok ? null : (result.error ?? 'Connection failed'),
    },
  })
  return { ok: result.ok, error: result.error ?? null }
}

export async function setCourierConnectionActive(merchantId: string, provider: string, active: boolean) {
  const name = provider as CourierProviderName
  const connection = await prisma.courierConnection.findUnique({ where: { merchantId_provider: { merchantId, provider } } })
  if (!connection) {
    if (!active) return null
    return saveCourierConnection({ merchantId, provider: name, testMode: name === 'mock' })
  }
  return prisma.courierConnection.update({
    where: { id: connection.id },
    data: { status: active ? 'connected' : 'disconnected', lastError: active ? null : connection.lastError },
  })
}

export async function deleteCourierConnection(merchantId: string, provider: string) {
  await prisma.courierConnection.deleteMany({ where: { merchantId, provider } })
}

/**
 * The provider to use for new shipments for this merchant. Defaults to the mock
 * (test mode) unless the merchant connected a live courier AND enabled it.
 */
export async function getShipmentProviderForMerchant(merchantId: string): Promise<{
  provider: CourierProvider
  providerName: string
  testMode: boolean
  connection: CourierConnection | null
}> {
  const connections = await prisma.courierConnection.findMany({ where: { merchantId } })
  // Prefer a non-mock, connected connection, else the mock connection, else mock.
  const live = connections.find(c => c.provider !== 'mock' && c.status === 'connected' && c.testMode === false)
  const mock = connections.find(c => c.provider === 'mock' && (c.status === 'connected' || c.testMode === true))
  const chosen = live || mock || null
  const testMode = !live

  if (!chosen) {
    return { provider: getCourierProvider('mock'), providerName: 'mock', testMode: true, connection: null }
  }

  const credentials = decryptJson<CourierCredentials>(chosen.credentialsEncrypted)
  const provider = testMode ? getCourierProvider('mock') : getCourierProvider(chosen.provider as CourierProviderName, credentials)
  return {
    provider,
    providerName: testMode ? 'mock' : chosen.provider,
    testMode,
    connection: chosen,
  }
}

/** Decrypt the webhook secret for a provider+merchant (used by the shipping webhook route). */
export async function getCourierWebhookSecret(merchantId: string, provider: string): Promise<string | null> {
  const connection = await prisma.courierConnection.findUnique({ where: { merchantId_provider: { merchantId, provider } } })
  if (connection?.webhookSecretEncrypted) {
    try {
      return decryptSecret(connection.webhookSecretEncrypted)
    } catch {
      return null
    }
  }
  return null
}

/** Resolve a specific named provider with the merchant's stored credentials. */
export async function getProviderByName(merchantId: string, name: string): Promise<{
  provider: CourierProvider
  providerName: string
  testMode: boolean
  connection: CourierConnection | null
  error?: string
}> {
  const normalized = name as CourierProviderName
  if (normalized === 'mock') {
    return { provider: getCourierProvider('mock'), providerName: 'mock', testMode: true, connection: null }
  }
  const connection = await prisma.courierConnection.findUnique({ where: { merchantId_provider: { merchantId, provider: normalized } } })
  if (!connection) {
    return { provider: getCourierProvider(normalized), providerName: normalized, testMode: true, connection: null, error: `No ${normalized} connection found for this merchant` }
  }
  if (connection.status === 'error') {
    return { provider: getCourierProvider(normalized), providerName: normalized, testMode: true, connection, error: connection.lastError ?? 'Courier connection is in an error state' }
  }
  const credentials = decryptJson<CourierCredentials>(connection.credentialsEncrypted)
  return {
    provider: getCourierProvider(normalized, credentials),
    providerName: normalized,
    testMode: connection.testMode,
    connection,
  }
}

export function serializeCourierConnection(c: CourierConnection) {
  return {
    id: c.id,
    provider: c.provider,
    label: c.label,
    status: c.status,
    test_mode: c.testMode,
    has_credentials: Boolean(c.credentialsEncrypted && c.credentialsEncrypted.length > 10),
    last_tested_at: c.lastTestedAt?.toISOString() ?? null,
    last_error: c.lastError,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  }
}

/** Same as serializeCourierConnection plus the merchant's webhook secret (for configuring the courier dashboard). */
export async function serializeCourierConnectionWithSecret(c: CourierConnection) {
  const base = serializeCourierConnection(c)
  return {
    ...base,
    webhook_secret: await getCourierWebhookSecret(c.merchantId, c.provider),
  }
}

export async function listCourierConnections(merchantId: string) {
  const rows = await prisma.courierConnection.findMany({ where: { merchantId }, orderBy: { provider: 'asc' } })
  return rows.map(serializeCourierConnection)
}