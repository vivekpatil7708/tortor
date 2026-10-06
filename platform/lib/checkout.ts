import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import { createOrder, type OrderItemInput } from '@/lib/orders'
import { getProvider } from '@/lib/payments'
import { resolveItemPrices, computeTotals, verifyAmount } from '@/lib/pricing'
import type { KeyMode, PaymentStatus, OrderSource } from '@prisma/client'

export const TOROPAY_PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://checkout.toropay.co.in'

export function generatePaymentReference(): string {
  return `TPPAY-${nanoid(12).toUpperCase().replace(/[^A-Z0-9]/g, '')}`
}

export function generateCheckoutSessionId(): string {
  return `cs_${nanoid(24)}`
}

export interface CheckoutCustomerInput {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export interface CheckoutItemInput extends OrderItemInput {}

export interface CreateCheckoutInput {
  merchantId: string
  mode: KeyMode
  merchantOrderReference?: string | null
  customer?: CheckoutCustomerInput | null
  items: CheckoutItemInput[]
  currency?: string
  discountAmount?: number
  shippingAmount?: number
  taxAmount?: number
  /**
   * When provided, the server verifies its computed total against this value
   * and rejects the checkout if they differ. Sending a client-computed total
   * is therefore safe: the catalogue always wins.
   */
  expectedTotal?: number | null
  shippingAddress?: Record<string, unknown> | null
  billingAddress?: Record<string, unknown> | null
  successUrl?: string | null
  cancelUrl?: string | null
  metadata?: Record<string, unknown> | null
  expiresAt?: Date | null
  orderSource?: OrderSource
  checkoutLinkId?: string | null
  idempotencyKey?: string | null
  provider?: string
}

export interface CreateCheckoutResult {
  toropay_order_id: string
  order_number: string
  payment_reference: string
  checkout_session_id: string
  checkout_url: string
  status: PaymentStatus
  mode: KeyMode
  reused: boolean
  /** Authoritative payable amount created on the backend. */
  amount: number
  /** Authoritative amounts for the order summary (server-computed). */
  subtotal_amount: number
  discount_amount: number
  shipping_amount: number
  tax_amount: number
  currency: string
  /** Alias for `amount` — the amount that passed server-side verification. */
  verified_amount: number
}

function buildCheckoutUrl(sessionId: string): string {
  return `${TOROPAY_PUBLIC_URL}/checkout/${sessionId}`
}

/**
 * Core Phase 2 checkout creation. Shared by the merchant order API and
 * payment links.
 *
 * Idempotency: a provided `idempotencyKey` (or `merchantOrderReference`) is
 * checked first; a matching payment/order is returned as-is so retries never
 * create a second order.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const {
    merchantId,
    mode,
    merchantOrderReference = null,
    customer = null,
    items,
    currency = 'INR',
    discountAmount = 0,
    shippingAmount = 0,
    taxAmount = 0,
    shippingAddress = null,
    billingAddress = null,
    successUrl = null,
    cancelUrl = null,
    metadata = null,
    expiresAt = null,
    orderSource = 'website_api',
    checkoutLinkId = null,
    idempotencyKey = null,
    provider = 'mock',
    expectedTotal = null,
  } = input

  if (!items.length) throw new Error('Order must have at least one item')

  // ---- idempotency: return the existing result on retries ----------------
  if (idempotencyKey || merchantOrderReference) {
    const existing = await prisma.payment.findFirst({
      where: {
        merchantId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(merchantOrderReference && !idempotencyKey ? { merchantOrderReference } : {}),
      },
      include: { order: true },
    })
    if (existing?.order) {
      const amounts = {
        amount: existing.amount.toNumber(),
        subtotal_amount: existing.order.subtotalAmount.toNumber(),
        discount_amount: existing.order.discountAmount.toNumber(),
        shipping_amount: existing.order.shippingAmount.toNumber(),
        tax_amount: existing.order.taxAmount.toNumber(),
      }
      return {
        toropay_order_id: existing.order.id,
        order_number: existing.order.orderNumber,
        payment_reference: existing.paymentReference,
        checkout_session_id: existing.checkoutSessionId,
        checkout_url: buildCheckoutUrl(existing.checkoutSessionId),
        status: existing.status,
        mode: existing.mode,
        reused: true,
        ...amounts,
        currency: existing.currency,
        verified_amount: amounts.amount,
      }
    }
  }

  // ---- authoritative pricing: catalogue wins over whatever the client sent --
  const priced = await resolveItemPrices({ merchantId, items })
  const totals = computeTotals({
    items: priced.items,
    discountAmount: discountAmount ?? 0,
    shippingAmount: shippingAmount ?? 0,
    taxAmount: taxAmount ?? 0,
  })
  if (totals.total < 0) throw new Error('Total amount cannot be negative')

  if (expectedTotal !== null && expectedTotal !== undefined) {
    if (!verifyAmount(totals.total, expectedTotal)) {
      throw new Error(
        `Amount verification failed: expected ${expectedTotal} but the server-computed total is ${totals.total}`
      )
    }
  }

  const order = await createOrder({
    merchantId,
    customer: customer ? { fullName: customer.name || '', phone: customer.phone ?? null, email: customer.email ?? null } : null,
    source: orderSource,
    items: priced.items.map(item => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    discountAmount: totals.discount,
    shippingAmount: totals.shipping,
    taxAmount: totals.tax,
    shippingAddress,
    billingAddress,
    customerNote: null,
    testMode: mode === 'test',
    merchantOrderReference,
    checkoutLinkId,
  })

  if (!order) throw new Error('Failed to create order')

  const paymentReference = generatePaymentReference()
  const checkoutSessionId = generateCheckoutSessionId()

  const payment = await prisma.payment.create({
    data: {
      merchantId,
      orderId: order.id,
      checkoutLinkId,
      checkoutSessionId,
      paymentReference,
      merchantOrderReference,
      provider,
      mode,
      amount: totals.total,
      currency,
      expiresAt,
      idempotencyKey,
      providerResponse: metadata ? (metadata as object) : undefined,
    },
  })

  const providerAdapter = getProvider(provider as 'mock' | 'razorpay' | 'cashfree')
  const session = await providerAdapter.createCheckoutSession({
    merchantId,
    orderId: order.id,
    paymentId: payment.id,
    checkoutSessionId,
    paymentReference,
    amount: totals.total,
    currency,
    mode,
    customer,
    successUrl,
    cancelUrl,
    metadata,
    expiresAt,
  })

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: session.providerPaymentId,
      providerOrderId: session.providerOrderId ?? null,
      providerCheckoutSessionId: session.providerCheckoutSessionId ?? null,
      paymentLinkUrl: session.checkoutUrl ?? null,
      paymentMethod: provider === 'upi' ? 'upi' : 'mock',
      status: session.status,
      providerResponse:
        metadata || session.providerResponse
          ? { ...((session.providerResponse as object) || {}), ...(metadata ? (metadata as object) : {}) }
          : undefined,
    },
  })

  return {
    toropay_order_id: order.id,
    order_number: order.orderNumber,
    payment_reference: paymentReference,
    checkout_session_id: checkoutSessionId,
    checkout_url: session.checkoutUrl
      ? `${TOROPAY_PUBLIC_URL}${session.checkoutUrl.startsWith('http') ? '' : session.checkoutUrl}`
      : buildCheckoutUrl(checkoutSessionId),
    status: session.status,
    mode,
    reused: false,
    amount: totals.total,
    subtotal_amount: totals.subtotal,
    discount_amount: totals.discount,
    shipping_amount: totals.shipping,
    tax_amount: totals.tax,
    currency,
    verified_amount: totals.total,
  }
}

export interface CheckoutView {
  payment: {
    checkout_session_id: string
    payment_reference: string
    status: PaymentStatus
    amount: number
    currency: string
    provider: string
    mode: KeyMode
    expires_at: string | null
    paid_at: string | null
    payment_method: string | null
  }
  order: {
    id: string
    order_number: string
    subtotal_amount: number
    discount_amount: number
    shipping_amount: number
    tax_amount: number
    total_amount: number
    currency: string
    customer_name: string | null
    customer_email: string | null
    customer_phone: string | null
    items: Array<{ name: string; sku: string | null; quantity: number; unit_price: number; line_total: number }>
  }
  merchant: {
    id: string
    business_name: string
    business_logo_url: string | null
    bg_image_url: string | null
    brand_color_primary: string
    brand_color_secondary: string
    brand_font: string
    button_style: string
    page_theme: string
    support_email: string | null
    support_phone: string | null
    custom_message: string | null
    upi_id: string | null
  }
}

/**
 * Build the public checkout view for a checkout session id. Exposes no
 * provider secrets. Returns null for unknown/expired sessions.
 */
export async function getCheckoutView(checkoutSessionId: string): Promise<CheckoutView | null> {
  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId },
    include: {
      order: { include: { orderItems: true, customer: true } },
      // Only what the page shows, never the merchant's whole account record.
      merchant: {
        select: {
          id: true,
          businessName: true,
          businessLogoUrl: true,
          bgImageUrl: true,
          brandColorPrimary: true,
          brandColorSecondary: true,
          brandFont: true,
          buttonStyle: true,
          pageTheme: true,
          supportEmail: true,
          supportPhone: true,
          upiIds: { select: { vpa: true, status: true, isPrimary: true } },
        },
      },
    },
  })
  if (!payment?.order || !payment.merchant) return null
  if (payment.expiresAt && payment.expiresAt < new Date() && payment.status === 'pending') return null

  const o = payment.order
  // Contact details saved before this order (from an earlier purchase) aren't
  // shown on this public page; the shopper types them again.
  const savedEarlier = !!o.customer && o.customer.createdAt.getTime() < o.createdAt.getTime() - 60_000
  const activeUpi = payment.merchant.upiIds
    .filter(u => u.status === 'active')
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]?.vpa ?? null
  return {
    payment: {
      checkout_session_id: payment.checkoutSessionId,
      payment_reference: payment.paymentReference,
      status: payment.status,
      amount: payment.amount.toNumber(),
      currency: payment.currency,
      provider: payment.provider,
      mode: payment.mode,
      expires_at: payment.expiresAt?.toISOString() ?? null,
      paid_at: payment.paidAt?.toISOString() ?? null,
      payment_method: payment.paymentMethod,
    },
    order: {
      id: o.id,
      order_number: o.orderNumber,
      subtotal_amount: o.subtotalAmount.toNumber(),
      discount_amount: o.discountAmount.toNumber(),
      shipping_amount: o.shippingAmount.toNumber(),
      tax_amount: o.taxAmount.toNumber(),
      total_amount: o.totalAmount.toNumber(),
      currency: o.currency,
      customer_name: savedEarlier ? null : o.customer?.fullName ?? null,
      customer_email: savedEarlier ? null : o.customer?.email ?? null,
      customer_phone: savedEarlier ? null : o.customer?.phone ?? null,
      items: o.orderItems.map(i => ({
        name: i.productNameSnapshot,
        sku: i.skuSnapshot,
        quantity: i.quantityOrdered,
        unit_price: i.unitPrice.toNumber(),
        line_total: i.lineTotal.toNumber(),
      })),
    },
    merchant: {
      id: payment.merchant.id,
      business_name: payment.merchant.businessName,
      business_logo_url: payment.merchant.businessLogoUrl,
      bg_image_url: payment.merchant.bgImageUrl,
      brand_color_primary: payment.merchant.brandColorPrimary,
      brand_color_secondary: payment.merchant.brandColorSecondary,
      brand_font: payment.merchant.brandFont,
      button_style: payment.merchant.buttonStyle,
      page_theme: payment.merchant.pageTheme,
      support_email: payment.merchant.supportEmail,
      support_phone: payment.merchant.supportPhone,
      custom_message: null,
      upi_id: activeUpi,
    },
  }
}

export interface UpdateCheckoutCustomerInput {
  checkoutSessionId: string
  name?: string | null
  email?: string | null
  phone?: string | null
}

/**
 * Update the order's customer with details collected on the checkout form.
 * Reuses an existing customer row (same merchant) only when both email and
 * phone match.
 */
export async function updateCheckoutCustomer(input: UpdateCheckoutCustomerInput): Promise<CheckoutView | null> {
  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId: input.checkoutSessionId },
    include: { order: { include: { customer: true } } },
  })
  if (!payment?.order) return null
  if (payment.status !== 'pending' && payment.status !== 'processing') return null

  const order = payment.order
  const name = (input.name || '').trim()
  if (!name || !['pending', 'processing'].includes(payment.status)) return null

  let customerId = order.customerId || null
  const email = (input.email || '').trim().toLowerCase() || null
  const phone = (input.phone || '').trim() || null

  let customer = order.customer
  // A saved customer is only reused when both email and phone match, so typing
  // someone else's email or phone can't attach this order to their record.
  if (!customerId && email && phone) {
    const existing = await prisma.customer.findFirst({
      where: { merchantId: payment.merchantId, email, phone },
    })
    if (existing) {
      customer = existing
      customerId = existing.id
    }
  }

  if (!customerId) {
    customer = await prisma.customer.create({
      data: {
        merchantId: payment.merchantId,
        fullName: name,
        email,
        phone,
      },
    })
    customerId = customer.id
  } else if (customer) {
    const updates: { [k: string]: unknown } = {}
    if (email && !customer.email) updates.email = email
    if (phone && !customer.phone) updates.phone = phone
    if (Object.keys(updates).length) {
      customer = await prisma.customer.update({ where: { id: customer.id }, data: updates })
    }
  }

  if (customerId !== order.customerId) {
    await prisma.order.update({ where: { id: order.id }, data: { customerId } })
  }

  return getCheckoutView(input.checkoutSessionId)
}