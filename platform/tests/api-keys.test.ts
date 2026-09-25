import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { makeMerchant } from './helpers'
import { hashApiKey, generateApiKey, createApiKey, authenticateApiKey, revokeApiKey, rotateApiKey, serializeApiKey } from '@/lib/api-key'

describe('api keys: lifecycle', () => {
  let merchantA = ''
  let merchantB = ''

  beforeAll(async () => {
    merchantA = (await makeMerchant()).id
    merchantB = (await makeMerchant()).id
  })

  it('creates a key that authenticates and tracks usage', async () => {
    const { key, rawKey } = await createApiKey({ merchantId: merchantA, name: 'Primary', mode: 'test' })
    expect(rawKey.startsWith('tp_test_')).toBe(true)
    expect(key.keyPrefix).toBe(rawKey.slice(0, 21))
    expect(key.keyHash).toBe(hashApiKey(rawKey))

    const auth = await authenticateApiKey(`Bearer ${rawKey}`)
    expect(auth).not.toBeNull()
    expect(auth!.merchantId).toBe(merchantA)
    expect(auth!.apiKeyId).toBe(key.id)
    expect(auth!.mode).toBe('test')
    expect(auth!.scopes).toContain('write')

    const updated = await prisma.apiKey.findUnique({ where: { id: key.id } })
    expect(updated!.lastUsedAt).not.toBeNull()
  })

  it('publishable keys get a distinct format and scopes', async () => {
    const { key, rawKey } = await createApiKey({ merchantId: merchantA, name: 'Frontend', mode: 'live', scope: 'publishable' })
    expect(rawKey.startsWith('tp_live_pub_')).toBe(true)
    expect(JSON.parse(key.scopes)).toEqual(['publishable'])
    const auth = await authenticateApiKey(`Bearer ${rawKey}`)
    expect(auth).not.toBeNull()
  })

  it('rejects a wrong or untyped secret', async () => {
    const { rawKey } = await createApiKey({ merchantId: merchantA, name: 'X', mode: 'test' })
    expect(await authenticateApiKey(`Bearer ${rawKey}x`)).toBeNull()
    expect(await authenticateApiKey('Bearer ')).toBeNull()
    expect(await authenticateApiKey('Basic abc')).toBeNull()
    expect(await authenticateApiKey(null)).toBeNull()
  })

  it('supports legacy bcrypt Phase 1 keys', async () => {
    const legacy = `tp_legacy_${'a'.repeat(40)}`
    const legacyRow = await prisma.apiKey.create({
      data: {
        merchantId: merchantB,
        name: 'Legacy',
        keyHash: bcrypt.hashSync(legacy, 10),
        keyPrefix: legacy.slice(0, 12),
        mode: 'live',
        scopes: JSON.stringify(['read', 'write']),
      },
    })
    const auth = await authenticateApiKey(`Bearer ${legacy}`)
    expect(auth).not.toBeNull()
    expect(auth!.merchantId).toBe(merchantB)
    expect(auth!.apiKeyId).toBe(legacyRow.id)
  })

  it('is scoped: one merchants key never auths as another', async () => {
    const { rawKey } = await createApiKey({ merchantId: merchantA, name: 'A', mode: 'live' })
    const { rawKey: other } = await createApiKey({ merchantId: merchantB, name: 'B', mode: 'test' })
    expect(await authenticateApiKey(`Bearer ${rawKey}`)).toMatchObject({ merchantId: merchantA })
    expect(await authenticateApiKey(`Bearer ${other}`)).toMatchObject({ merchantId: merchantB })
  })

  it('ignores revoked and expired keys', async () => {
    const { key, rawKey } = await createApiKey({ merchantId: merchantA, name: 'Temp', mode: 'test' })
    await prisma.apiKey.update({ where: { id: key.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await authenticateApiKey(`Bearer ${rawKey}`)).toBeNull()

    const { key: k2, rawKey: r2 } = await createApiKey({ merchantId: merchantA, name: 'Temp2', mode: 'test' })
    await revokeApiKey(k2.id, merchantA)
    expect(await authenticateApiKey(`Bearer ${r2}`)).toBeNull()
    expect(await revokeApiKey(k2.id, merchantA)).toBe(false)
  })

  it('rotate revokes the old key and returns a working new one', async () => {
    const { key, rawKey } = await createApiKey({ merchantId: merchantA, name: 'Rotate', mode: 'live' })
    const next = await rotateApiKey(key.id, merchantA)
    expect(next).not.toBeNull()
    expect(next!.rawKey).not.toBe(rawKey)

    expect(await authenticateApiKey(`Bearer ${rawKey}`)).toBeNull()
    const auth = await authenticateApiKey(`Bearer ${next!.rawKey}`)
    expect(auth).toMatchObject({ merchantId: merchantA, mode: 'live' })
  })

  it('serializer never exposes the raw key', async () => {
    const { key, rawKey } = await createApiKey({ merchantId: merchantA, name: 'S', mode: 'test' })
    const serialized = JSON.stringify(serializeApiKey(key))
    expect(serialized).not.toContain(rawKey)
    expect(serialized).not.toContain(key.keyHash)
  })

  it('generated keys have the documented prefix lengths', async () => {
    const key = generateApiKey('live')
    expect(key.rawKey.startsWith('tp_live_')).toBe(true)
    expect(key.keyPrefix.length).toBe(21)
    const pub = generateApiKey('test', 'publishable')
    expect(pub.rawKey.startsWith('tp_test_pub_')).toBe(true)
  })
})