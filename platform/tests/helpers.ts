import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

let seq = 0
function uid(prefix: string) {
  seq += 1
  return `${prefix}_${Date.now()}_${seq}`
}

function phone() {
  seq += 1
  return String(9000000000 + (Date.now() % 100000) + seq).slice(0, 10)
}

type MerchantOverrides = Partial<Prisma.MerchantUncheckedCreateInput>
type CustomerOverrides = Partial<Prisma.CustomerUncheckedCreateInput>
type ProductOverrides = Partial<Prisma.ProductUncheckedCreateInput>

export async function makeMerchant(overrides: MerchantOverrides = {}) {
  const email = uid('merchant') + '@test.dev'
  return prisma.merchant.create({
    data: {
      ...overrides,
      email,
      phone: phone(),
      passwordHash: 'hash',
      businessName: 'Test Store',
      onboardingComplete: true,
    },
  })
}

export async function makeCustomer(merchantId: string, overrides: CustomerOverrides = {}) {
  return prisma.customer.create({
    data: {
      ...overrides,
      merchantId,
      fullName: 'Test Customer',
      phone: '9111111111',
    },
  })
}

export async function makeProduct(merchantId: string, overrides: ProductOverrides = {}) {
  return prisma.product.create({
    data: {
      ...overrides,
      merchantId,
      name: 'Test Product',
      sku: uid('SKU'),
      price: 100,
      productType: 'physical',
      status: 'active',
    },
  })
}