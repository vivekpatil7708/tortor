import crypto from 'crypto'
import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { generateApiKey } from '@/lib/api-key'
import { prisma } from '@/lib/prisma'
import { testState } from './state'

/** Empties every table. setup.ts has already made sure this is the local test database. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  }
  testState.signedIn = null
  testState.afterTasks.length = 0
  testState.webhooks.length = 0
}

let counter = 0
export const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`
export const newTxnId = () => `TXN${Date.now()}${unique().toUpperCase().slice(-6)}`

/** A verified merchant who has finished setup, with a UPI ID unless asked otherwise. */
export async function createMerchant(opts: { withUpi?: boolean; alerts?: boolean } = {}) {
  const merchant = await prisma.merchant.create({
    data: { email: `merchant-${unique()}@example.com`, businessName: 'Test Shop', emailVerifiedAt: new Date(), onboardingComplete: true },
  })
  if (opts.withUpi !== false) {
    await prisma.upiId.create({ data: { merchantId: merchant.id, vpa: `shop${unique()}@okaxis`, isPrimary: true } })
  }
  if (opts.alerts) {
    await prisma.merchantSettings.create({ data: { merchantId: merchant.id, emailEnabled: true } })
  }
  return merchant
}

export function signIn(merchant: { id: string; email: string; emailVerifiedAt: Date | null }) {
  testState.signedIn = { id: merchant.id, email: merchant.email, emailVerifiedAt: merchant.emailVerifiedAt }
}

export function signOut() {
  testState.signedIn = null
}

export async function createLink(merchantId: string, data: Partial<Prisma.PaymentLinkUncheckedCreateInput> = {}) {
  const upi = await prisma.upiId.findFirst({ where: { merchantId } })
  return prisma.paymentLink.create({
    data: { merchantId, upiId: upi?.vpa ?? 'shop@okaxis', title: 'Test link', slug: `t${unique()}`, amount: 499, ...data },
  })
}

/** A test-mode API key with read and write access, for the website-checkout API. */
export async function createApiKey(merchantId: string) {
  const { rawKey, keyPrefix, keyHash } = generateApiKey('test')
  await prisma.apiKey.create({
    data: { merchantId, name: 'tests', keyPrefix, keyHash, mode: 'test', scopes: JSON.stringify(['read', 'write']) },
  })
  return rawKey
}

export function request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const body = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body)
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...init.headers },
    body,
  })
}

/** Signs a mock-provider webhook body the way the provider would. */
export function signMockWebhook(rawBody: string) {
  return crypto.createHmac('sha256', process.env.MOCK_WEBHOOK_SECRET!).update(rawBody).digest('hex')
}
