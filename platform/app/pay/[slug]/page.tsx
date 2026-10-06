import { prisma } from '@/lib/prisma'
import { CHECKOUT_MERCHANT_FIELDS, serializeCheckoutLink, serializeCheckoutMerchant } from '@/lib/serializers'
import { notFound } from 'next/navigation'
import CheckoutClient from './checkout-client'

export const dynamic = 'force-dynamic'

async function getLinkData(slug: string) {
  const link = await prisma.paymentLink.findFirst({
    where: { slug, status: 'active' },
  })
  if (!link) return null
  if (link.expiryAt && link.expiryAt < new Date()) return null
  if (link.maxUses && link.useCount >= link.maxUses) return null

  const merchant = await prisma.merchant.findUnique({ where: { id: link.merchantId }, select: CHECKOUT_MERCHANT_FIELDS })
  if (!merchant || merchant.status === 'suspended') return null

  return {
    link: serializeCheckoutLink(link),
    merchant: serializeCheckoutMerchant(merchant),
  }
}

export default async function CheckoutPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const data = await getLinkData(params.slug)
  if (!data) notFound()
  return <CheckoutClient data={data} />
}
