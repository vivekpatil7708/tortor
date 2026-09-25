import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import { createCheckout, TOROPAY_PUBLIC_URL, type CreateCheckoutResult } from '@/lib/checkout'
import { Prisma } from '@prisma/client'
import type { KeyMode } from '@prisma/client'

export function generateLinkSlug(): string {
  return `${nanoid(10)}`.toLowerCase()
}

export interface CheckoutLinkItemInput {
  productId?: string | null
  name: string
  sku?: string | null
  quantity: number
  unitPrice: number
}

export interface CheckoutLinkItem {
  productId: string | null
  name: string
  sku: string | null
  quantity: number
  unitPrice: number
}

/** Parse the link's stored items JSON defensively. */
function toCheckoutLinkItem(entry: unknown): CheckoutLinkItem | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  const name = typeof e.name === 'string' ? e.name : ''
  if (!name.trim()) return null
  return {
    productId: typeof e.productId === 'string' ? e.productId : null,
    name,
    sku: typeof e.sku === 'string' ? e.sku : null,
    quantity: typeof e.quantity === 'number' && e.quantity > 0 ? Math.floor(e.quantity) : 1,
    unitPrice: typeof e.unitPrice === 'number' && e.unitPrice >= 0 ? e.unitPrice : 0,
  }
}

export function parseCheckoutLinkItems(raw: Prisma.JsonValue | null | undefined): CheckoutLinkItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map(toCheckoutLinkItem).filter((item): item is CheckoutLinkItem => item !== null)
}

export function serializeCheckoutLinkItem(item: CheckoutLinkItem) {
  const lineTotal = Math.round(item.unitPrice * item.quantity * 100) / 100
  return {
    product_id: item.productId,
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    line_total: lineTotal,
  }
}

export interface CreateCheckoutLinkInput {
  merchantId: string
  title: string
  description?: string | null
  mode: KeyMode
  amount?: number | null
  amountFlexible?: boolean
  minAmount?: number | null
  maxAmount?: number | null
  productId?: string | null
  productName?: string | null
  productPrice?: number | null
  items?: CheckoutLinkItemInput[] | null
  collectName?: boolean
  collectPhone?: boolean
  collectEmail?: boolean
  collectAddress?: boolean
  collectNote?: boolean
  successUrl?: string | null
  customMessage?: string | null
  expiryAt?: Date | null
  maxPayments?: number | null
  active?: boolean
}

export async function createCheckoutLink(input: CreateCheckoutLinkInput) {
  let slug = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    slug = generateLinkSlug()
    const existing = await prisma.checkoutLink.findUnique({ where: { slug } })
    if (!existing) break
    slug = ''
  }
  if (!slug) throw new Error('Unable to generate a unique link slug, try again')

  const link = await prisma.checkoutLink.create({
    data: {
      merchantId: input.merchantId,
      slug,
      title: input.title,
      description: input.description ?? null,
      mode: input.mode,
      amount: input.amount ?? null,
      amountFlexible: input.amountFlexible ?? false,
      minAmount: input.minAmount ?? null,
      maxAmount: input.maxAmount ?? null,
      productId: input.productId ?? null,
      productName: input.productName ?? null,
      productPrice: input.productPrice ?? null,
      ...(input.items && input.items.length
        ? { itemsJson: input.items as unknown as Prisma.InputJsonValue }
        : {}),
      collectName: input.collectName ?? true,
      collectPhone: input.collectPhone ?? true,
      collectEmail: input.collectEmail ?? true,
      collectAddress: input.collectAddress ?? false,
      collectNote: input.collectNote ?? false,
      successUrl: input.successUrl ?? null,
      customMessage: input.customMessage ?? null,
      expiryAt: input.expiryAt ?? null,
      maxPayments: input.maxPayments ?? null,
      active: input.active ?? true,
    },
  })
  return link
}

export async function updateCheckoutLink(id: string, merchantId: string, input: Partial<CreateCheckoutLinkInput>) {
  const allowed = {
    title: input.title,
    description: input.description ?? null,
    mode: input.mode,
    amount: input.amount ?? null,
    amountFlexible: input.amountFlexible,
    minAmount: input.minAmount ?? null,
    maxAmount: input.maxAmount ?? null,
    productName: input.productName ?? null,
    productPrice: input.productPrice ?? null,
    ...(input.items === undefined
      ? {}
      : {
          itemsJson: input.items && input.items.length
            ? (input.items as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        }),
    collectName: input.collectName,
    collectPhone: input.collectPhone,
    collectEmail: input.collectEmail,
    collectAddress: input.collectAddress,
    collectNote: input.collectNote,
    successUrl: input.successUrl ?? null,
    customMessage: input.customMessage ?? null,
    expiryAt: input.expiryAt ?? null,
    maxPayments: input.maxPayments ?? null,
    active: input.active,
  }
  for (const key of Object.keys(allowed)) {
    if (allowed[key as keyof typeof allowed] === undefined) delete (allowed as Record<string, unknown>)[key]
  }
  return prisma.checkoutLink.updateMany({
    where: { id, merchantId },
    data: allowed as Prisma.CheckoutLinkUpdateManyMutationInput,
  })
}

export async function deleteCheckoutLink(id: string, merchantId: string) {
  return prisma.checkoutLink.deleteMany({ where: { id, merchantId } })
}

export function serializeCheckoutLink(link: {
  id: string
  slug: string
  title: string
  description: string | null
  mode: KeyMode
  amount: { toNumber(): number } | null
  amountFlexible: boolean
  minAmount: { toNumber(): number } | null
  maxAmount: { toNumber(): number } | null
  productName: string | null
  productPrice: { toNumber(): number } | null
  itemsJson: Prisma.JsonValue | null
  collectName: boolean
  collectPhone: boolean
  collectEmail: boolean
  collectAddress: boolean
  collectNote: boolean
  successUrl: string | null
  customMessage: string | null
  expiryAt: Date | null
  maxPayments: number | null
  paymentCount: number
  active: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: link.id,
    slug: link.slug,
    title: link.title,
    description: link.description,
    mode: link.mode,
    amount: link.amount ? link.amount.toNumber() : null,
    amount_flexible: link.amountFlexible,
    min_amount: link.minAmount ? link.minAmount.toNumber() : null,
    max_amount: link.maxAmount ? link.maxAmount.toNumber() : null,
    product_name: link.productName,
    product_price: link.productPrice ? link.productPrice.toNumber() : null,
    items: parseCheckoutLinkItems(link.itemsJson).map(serializeCheckoutLinkItem),
    items_total: parseCheckoutLinkItems(link.itemsJson).reduce(
      (sum, it) => sum + Math.round(it.unitPrice * it.quantity * 100) / 100,
      0
    ),
    collect_name: link.collectName,
    collect_phone: link.collectPhone,
    collect_email: link.collectEmail,
    collect_address: link.collectAddress,
    collect_note: link.collectNote,
    success_url: link.successUrl,
    custom_message: link.customMessage,
    expiry_at: link.expiryAt?.toISOString() ?? null,
    max_payments: link.maxPayments,
    payment_count: link.paymentCount,
    active: link.active,
    url: `${TOROPAY_PUBLIC_URL}/paylink/${link.slug}`,
    created_at: link.createdAt.toISOString(),
    updated_at: link.updatedAt.toISOString(),
  }
}

export interface PaylinkView {
  link: ReturnType<typeof serializeCheckoutLink>
  merchant: {
    business_name: string
    business_logo_url: string | null
    bg_image_url: string | null
    brand_color_primary: string
    brand_color_secondary: string
    button_style: string
    page_theme: string
    custom_message: string | null
  }
}

/** Public view for a payment link — validates active + expiry + max payments. */
export async function getPaylinkView(slug: string): Promise<PaylinkView | null> {
  const link = await prisma.checkoutLink.findUnique({ where: { slug }, include: { merchant: true } })
  if (!link || !link.active || link.merchant.status === 'suspended') return null
  if (link.expiryAt && link.expiryAt < new Date()) return null
  if (link.maxPayments !== null && link.paymentCount >= link.maxPayments) return null

  return {
    link: serializeCheckoutLink(link),
    merchant: {
      business_name: link.merchant.businessName,
      business_logo_url: link.merchant.businessLogoUrl,
      bg_image_url: link.merchant.bgImageUrl,
      brand_color_primary: link.merchant.brandColorPrimary,
      brand_color_secondary: link.merchant.brandColorSecondary,
      button_style: link.merchant.buttonStyle,
      page_theme: link.merchant.pageTheme,
      custom_message: link.customMessage,
    },
  }
}

export interface PaylinkCheckoutInput {
  customer?: { name?: string | null; email?: string | null; phone?: string | null } | null
  amount?: number | null
}

/**
 * Create a checkout session from a payment link. Follows the link's configured
 * amount (or accepts a custom amount for flexible links) and mode.
 */
export async function createCheckoutFromLink(
  slug: string,
  input: PaylinkCheckoutInput = {}
): Promise<CreateCheckoutResult | { error: string }> {
  const link = await prisma.checkoutLink.findUnique({ where: { slug }, include: { merchant: true } })
  if (!link || !link.active || link.merchant.status === 'suspended') return { error: 'Link not found' }
  if (link.expiryAt && link.expiryAt < new Date()) return { error: 'Link has expired' }
  if (link.maxPayments !== null && link.paymentCount >= link.maxPayments) return { error: 'Link has reached its payment limit' }

  let items: CheckoutLinkItem[]
  let expectedTotal: number | null = null
  const linkItems = parseCheckoutLinkItems(link.itemsJson)

  if (linkItems.length) {
    // Cart-style link: customer cannot change the amount. The backend re-prices
    // every line from the catalogue and returns the verified total.
    items = linkItems
  } else {
    let amount: number
    if (link.amountFlexible) {
      amount = input.amount ?? link.amount?.toNumber() ?? 0
      if (link.minAmount !== null && amount < link.minAmount.toNumber()) return { error: `Minimum amount is ₹${link.minAmount.toNumber()}` }
      if (link.maxAmount !== null && amount > link.maxAmount.toNumber()) return { error: `Maximum amount is ₹${link.maxAmount.toNumber()}` }
    } else {
      amount = link.amount?.toNumber() ?? link.productPrice?.toNumber() ?? 0
    }
    if (amount <= 0) return { error: 'Link amount is not configured' }

    items = [
      {
        productId: link.productId,
        name: link.productName ?? link.title,
        sku: null,
        quantity: 1,
        unitPrice: link.productPrice?.toNumber() ?? amount,
      },
    ]
    // For a fixed amount link without a catalogue product, the link amount is
    // the contract and must match the server-computed total.
    if (!link.productId && !link.amountFlexible) expectedTotal = amount
  }

  try {
    const result = await createCheckout({
      merchantId: link.merchantId,
      mode: link.mode,
      customer: input.customer ?? null,
      items: items.map(it => ({
        productId: it.productId,
        productName: it.name,
        sku: it.sku,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
      })),
      expectedTotal,
      successUrl: link.successUrl ?? null,
      metadata: { payment_link_id: link.id, payment_link_slug: link.slug },
      checkoutLinkId: link.id,
      orderSource: 'payment_link',
    })

    await prisma.checkoutLink.update({
      where: { id: link.id },
      data: { paymentCount: { increment: 1 } },
    })

    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create checkout' }
  }
}