import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { ApiKey, KeyMode } from '@prisma/client'

/** Pepper for API key hashes. Never falls back to a built-in value. */
function pepper(): string {
  const value = process.env.API_KEY_PEPPER || process.env.JWT_SECRET
  if (!value) throw new Error('API_KEY_PEPPER or JWT_SECRET must be set')
  return value
}

/** Fast, irreversible hash for API keys (HMAC-SHA256 with a pepper). */
export function hashApiKey(rawKey: string): string {
  return crypto.createHmac('sha256', pepper()).update(rawKey).digest('hex')
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export interface GeneratedApiKey {
  rawKey: string
  keyPrefix: string
  keyHash: string
  mode: KeyMode
}

/** Generate a new secret API key (only ever returned once). */
export function generateApiKey(mode: KeyMode, scope: 'secret' | 'publishable' = 'secret'): GeneratedApiKey {
  if (scope === 'publishable') {
    const rawKey = `tp_${mode}_pub_${crypto.randomBytes(16).toString('hex')}`
    const keyPrefix = rawKey.slice(0, 21)
    return { rawKey, keyPrefix, keyHash: hashApiKey(rawKey), mode }
  }
  const rawKey = `tp_${mode}_${crypto.randomBytes(24).toString('hex')}`
  const keyPrefix = rawKey.slice(0, 21)
  return { rawKey, keyPrefix, keyHash: hashApiKey(rawKey), mode }
}

export interface CreateApiKeyInput {
  merchantId: string
  name: string
  mode: KeyMode
  scope?: 'secret' | 'publishable'
}

export async function createApiKey(input: CreateApiKeyInput) {
  const { rawKey, keyPrefix, keyHash, mode } = generateApiKey(input.mode, input.scope)
  const key = await prisma.apiKey.create({
    data: {
      merchantId: input.merchantId,
      name: input.name,
      keyHash,
      keyPrefix,
      mode,
      scopes: JSON.stringify(input.scope === 'publishable' ? ['publishable'] : ['read', 'write']),
    },
  })
  return { key, rawKey }
}

export function serializeApiKey(k: ApiKey) {
  return {
    id: k.id,
    merchant_id: k.merchantId,
    name: k.name,
    key_prefix: k.keyPrefix,
    mode: k.mode,
    scopes: JSON.parse(k.scopes) as string[],
    expires_at: k.expiresAt?.toISOString() ?? null,
    last_used_at: k.lastUsedAt?.toISOString() ?? null,
    revoked_at: k.revokedAt?.toISOString() ?? null,
    created_at: k.createdAt.toISOString(),
  }
}

export interface ApiKeyAuth {
  merchantId: string
  apiKeyId: string
  mode: KeyMode
  scopes: string[]
}

/**
 * Authenticate a request using a Bearer API key.
 * Looks the key up by its prefix, then constant-time-compares the hash.
 */
export async function authenticateApiKey(authHeader: string | null): Promise<ApiKeyAuth | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const rawKey = authHeader.slice('Bearer '.length).trim()
  if (!rawKey) return null

  // New keys are found by their 21-char prefix. Legacy Phase 1 keys used only 12
  // characters, which several keys can share, so every candidate is checked
  // instead of trusting whichever one the database returns first.
  const current = await prisma.apiKey.findMany({ where: { keyPrefix: rawKey.slice(0, 21) }, take: 5 })
  const candidates = current.length
    ? current
    : await prisma.apiKey.findMany({ where: { keyPrefix: rawKey.slice(0, 12) }, orderBy: { createdAt: 'desc' }, take: 10 })

  const now = new Date()
  let key: (typeof candidates)[number] | null = null
  for (const candidate of candidates) {
    if (candidate.revokedAt || (candidate.expiresAt && candidate.expiresAt < now)) continue
    // Phase 2+ keys: HMAC-SHA256. Legacy keys: bcrypt.
    const valid = constantTimeEqual(hashApiKey(rawKey), candidate.keyHash) ||
      (await bcrypt.compare(rawKey, candidate.keyHash).catch(() => false))
    if (valid) {
      key = candidate
      break
    }
  }
  if (!key) return null

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return {
    merchantId: key.merchantId,
    apiKeyId: key.id,
    mode: key.mode === 'live' ? 'live' : 'test',
    scopes: JSON.parse(key.scopes) as string[],
  }
}

export async function revokeApiKey(apiKeyId: string, merchantId: string) {
  const updated = await prisma.apiKey.updateMany({
    where: { id: apiKeyId, merchantId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return updated.count > 0
}

/** Rotate: revoke the old key and create a fresh one with the same name/mode. */
export async function rotateApiKey(apiKeyId: string, merchantId: string) {
  const current = await prisma.apiKey.findFirst({ where: { id: apiKeyId, merchantId } })
  if (!current) return null
  await revokeApiKey(apiKeyId, merchantId)
  return createApiKey({ merchantId, name: current.name, mode: current.mode })
}