import { prisma } from '@/lib/prisma'
import {
  CHECKOUT_MERCHANT_FIELDS,
  CLOSED_LINK_MERCHANT_FIELDS,
  serializeCheckoutLink,
  serializeCheckoutMerchant,
} from '@/lib/serializers'
import { customerView } from '@/lib/checkout-status'
import { linkRoom } from '@/lib/link-uses'
import { isValidRedirectUrl } from '@/lib/validate-url'
import { notFound, redirect } from 'next/navigation'
import CheckoutClient from './checkout-client'
import LinkClosed, { type ClosedReason } from './link-closed'

export const dynamic = 'force-dynamic'

const TXN_ID = /^[A-Za-z0-9_-]{1,64}$/

async function getLinkData(slug: string, txnId: string | undefined) {
  // Deleted links don't exist; switched-off ones get a friendly page.
  const link = await prisma.paymentLink.findFirst({ where: { slug } })
  if (!link) return null

  // A payment already started on this link (the page was refreshed, or the phone
  // came back from the UPI app) reopens even if the link has since expired or
  // reached its use limit. Its amount always comes from the database.
  const started = link.status === 'active' && txnId && TXN_ID.test(txnId)
    ? await prisma.transaction.findFirst({
        where: { txnId, paymentLinkId: link.id },
        select: { txnId: true, amount: true, status: true },
      })
    : null

  let closed: ClosedReason | null = null
  if (link.status !== 'active') closed = 'inactive'
  else if (!started) {
    if (link.expiryAt && link.expiryAt < new Date()) closed = 'expired'
    else {
      const room = await linkRoom(prisma, link)
      if (room !== 'open') closed = room
    }
  }

  if (closed) {
    const merchant = await prisma.merchant.findUnique({ where: { id: link.merchantId }, select: CLOSED_LINK_MERCHANT_FIELDS })
    if (!merchant || merchant.status === 'suspended') return null
    return {
      closed,
      business: {
        name: merchant.businessName,
        logoUrl: merchant.businessLogoUrl,
        supportEmail: merchant.supportEmail,
        supportPhone: merchant.supportPhone,
      },
    } as const
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: link.merchantId }, select: CHECKOUT_MERCHANT_FIELDS })
  if (!merchant || merchant.status === 'suspended') return null

  return {
    closed: null,
    link: serializeCheckoutLink(link),
    merchant: serializeCheckoutMerchant(merchant),
    started,
  } as const
}

export default async function CheckoutPage(
  props: { params: Promise<{ slug: string }>; searchParams: Promise<{ txn?: string | string[] }> }
) {
  const params = await props.params;
  const { txn } = await props.searchParams;
  const data = await getLinkData(params.slug, typeof txn === 'string' ? txn : undefined)
  if (!data) notFound()
  if (data.closed) return <LinkClosed reason={data.closed} business={data.business} />

  const { started, link, merchant } = data
  if (started && customerView(started.status) !== 'waiting') {
    // Already confirmed or rejected: show the outcome, not the payment step.
    if (customerView(started.status) === 'confirmed' && link.redirect_url && isValidRedirectUrl(link.redirect_url)) {
      redirect(link.redirect_url)
    }
    redirect(`/pay/${params.slug}/success?txn=${encodeURIComponent(started.txnId)}`)
  }

  return (
    <CheckoutClient
      data={{ link, merchant }}
      resume={started ? { txn_id: started.txnId, amount: started.amount, status: started.status } : null}
    />
  )
}
