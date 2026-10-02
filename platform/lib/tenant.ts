import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Require an authenticated merchant. Throws if the user is not logged in.
 */
export async function requireMerchant() {
  return requireSession()
}

/**
 * Returns the merchant's primary (owner) merchant_user record.
 * Phase 1 uses a single owner record per merchant for all staff actions.
 */
export async function getOwnerUser(merchantId: string) {
  const user = await prisma.merchantUser.findFirst({
    where: { merchantId, role: 'owner' },
  })
  if (user) return user
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, email: true, name: true },
  })
  if (!merchant) return null
  return prisma.merchantUser.create({
    data: {
      merchantId,
      name: merchant.name || 'Owner',
      email: merchant.email,
      role: 'owner',
    },
  })
}