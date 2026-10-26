import { prisma } from '@/lib/prisma'
import { linkLimitsInput } from '@/lib/link-limits'
import { linkAmountInput } from '@/lib/money'
import { generateSlug } from '@/lib/utils'
import { isValidRedirectUrl } from '@/lib/validate-url'
import { isValidWebhookUrl } from '@/lib/safe-fetch'
import { productsImageProblem } from '@/lib/image-input'
import { dispatchMerchantWebhook } from '@/lib/webhook-delivery'
import { TOROPAY_PUBLIC_URL } from '@/lib/checkout'
import type { PaymentLink } from '@prisma/client'

// Creating a payment link, shared by the dashboard route (app/api/links POST)
// and the public v1 API (app/api/v1/links POST). The UPI ID is always looked up
// in the merchant's saved IDs, so a typo can't send customers' money to a stranger.

export type CreateLinkInput = {
  title?: unknown
  upi_id?: unknown
  description?: unknown
  amount?: unknown
  amount_flexible?: unknown
  min_amount?: unknown
  max_amount?: unknown
  custom_fields?: unknown
  max_uses?: unknown
  expiry_at?: unknown
  button_text?: unknown
  redirect_url?: unknown
  webhook_url?: unknown
  slug?: unknown
}

export type CreateLinkResult = { ok: true; link: PaymentLink } | { ok: false; error: string }

export async function createPaymentLink(merchantId: string, body: CreateLinkInput): Promise<CreateLinkResult> {
  if (!body.title || !body.upi_id) {
    return { ok: false, error: 'Title and UPI ID are required' }
  }

  // Links only pay into one of the merchant's saved UPI IDs, so a typo can't
  // send customers' money to a stranger.
  const savedUpi = await prisma.upiId.findFirst({
    where: { merchantId, vpa: { equals: String(body.upi_id).trim(), mode: 'insensitive' } },
  })
  if (!savedUpi) {
    return { ok: false, error: 'Add this UPI ID under UPI IDs first, then choose it for the link.' }
  }

  if (body.redirect_url && !isValidRedirectUrl(String(body.redirect_url))) {
    return { ok: false, error: 'Invalid redirect URL' }
  }

  if (body.webhook_url && !isValidWebhookUrl(String(body.webhook_url))) {
    return { ok: false, error: 'Invalid webhook URL' }
  }

  // Product images arrive as data URLs; keep them within the same 1 MB limit as logos.
  const imageProblem = productsImageProblem(body.custom_fields)
  if (imageProblem) return { ok: false, error: imageProblem }

  // Amounts are kept to whole paise: UPI apps can't charge fractions of a paisa.
  const amount = linkAmountInput(body.amount)
  const minAmount = linkAmountInput(body.min_amount, 'Minimum amount')
  const maxAmount = linkAmountInput(body.max_amount, 'Maximum amount')
  for (const check of [amount, minAmount, maxAmount]) {
    if (!check.ok) return { ok: false, error: check.error }
  }
  if (minAmount.ok && maxAmount.ok && minAmount.value && maxAmount.value && minAmount.value > maxAmount.value) {
    return { ok: false, error: "The minimum amount can't be more than the maximum" }
  }
  // Optional limits: a bad number or date used to reach the database as is.
  const limits = linkLimitsInput(body.max_uses, body.expiry_at)
  if (!limits.ok) return { ok: false, error: limits.error }

  const slug = String(body.slug || generateSlug())
  const link = await prisma.paymentLink.create({
    data: {
      merchantId,
      upiId: savedUpi.vpa,
      title: String(body.title),
      description: body.description ? String(body.description) : null,
      amount: amount.ok ? amount.value : null,
      amountFlexible: Boolean(body.amount_flexible),
      minAmount: minAmount.ok ? minAmount.value : null,
      maxAmount: maxAmount.ok ? maxAmount.value : null,
      customFields: JSON.stringify(body.custom_fields || []),
      expiryAt: limits.expiryAt,
      maxUses: limits.maxUses,
      buttonText: body.button_text ? String(body.button_text) : null,
      redirectUrl: body.redirect_url ? String(body.redirect_url) : null,
      webhookUrl: body.webhook_url ? String(body.webhook_url) : null,
      slug,
    },
  })

  // Delivery is best-effort: a slow receiver must never stop the link from
  // being created. Links are not test/live scoped, so this is a live event.
  await dispatchMerchantWebhook({
    merchantId,
    mode: 'live',
    eventType: 'payment_link.created',
    data: {
      link_id: link.id,
      title: link.title,
      slug: link.slug,
      link_url: `${TOROPAY_PUBLIC_URL.replace(/\/+$/, '')}/pay/${link.slug}`,
      amount: link.amount ? Number(link.amount) : null,
      amount_flexible: link.amountFlexible,
      upi_id: link.upiId,
    },
  }).catch(() => {})

  return { ok: true, link }
}
