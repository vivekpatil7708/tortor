import { prisma } from '@/lib/prisma'
import { CHECKOUT_MERCHANT_FIELDS, serializeCheckoutLink, serializeCheckoutMerchant } from '@/lib/serializers'
import { customerView } from '@/lib/checkout-status'
import { isValidRedirectUrl } from '@/lib/validate-url'
import { notFound, redirect } from 'next/navigation'
import CheckoutClient from './checkout-client'

export const dynamic = 'force-dynamic'

const TXN_ID = /^[A-Za-z0-9_-]{1,64}$/

async function getLinkData(slug: string, txnId: string | undefined) {
  const link = await prisma.paymentLink.findFirst({
    where: { slug, status: 'active' },
  })
  if (!link) return null

  // A payment already started on this link (the page was refreshed, or the phone
  // came back from the UPI app) reopens even if the link has since expired or
  // reached its use limit. Its amount always comes from the database.
  const started = txnId && TXN_ID.test(txnId)
    ? await prisma.transaction.findFirst({
        where: { txnId, paymentLinkId: link.id },
        select: { txnId: true, amount: true, status: true },
      })
    : null

  if (!started) {
    if (link.expiryAt && link.expiryAt < new Date()) return null
    if (link.maxUses && link.useCount >= link.maxUses) return null
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: link.merchantId }, select: CHECKOUT_MERCHANT_FIELDS })
  if (!merchant || merchant.status === 'suspended') return null

  return {
    link: serializeCheckoutLink(link),
    merchant: serializeCheckoutMerchant(merchant),
    started,
  }
}

export default async function CheckoutPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ txn?: string | string[] }> }
) {
  const params = await props.params;
  const { txn } = await props.searchParams;
  const data = await getLinkData(params.slug, typeof txn === 'string' ? txn : undefined)
  if (!data) notFound()

  const { started, ...checkout } = data
  if (started && customerView(started.status) !== 'waiting') {
    // Already confirmed or rejected: show the outcome, not the payment step.
    const merchantPage = checkout.link.redirect_url
    if (customerView(started.status) === 'confirmed' && merchantPage && isValidRedirectUrl(merchantPage)) {
      redirect(merchantPage)
    }
    redirect(`/pay/${params.slug}/success?txn=${encodeURIComponent(started.txnId)}`)
  }

  return (
    <CheckoutClient
      data={checkout}
      resume={started ? { txn_id: started.txnId, amount: started.amount, status: started.status } : null}
    />
  )
}
