import { prisma } from '@/lib/prisma'

export interface PricingItemInput {
  productId?: string | null
  productName: string
  sku?: string | null
  unitPrice: number
  quantity: number
}

export interface PricedItem {
  productId: string | null
  productName: string
  sku: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  source: 'catalog' | 'client'
}

export interface PricingResult {
  items: PricedItem[]
  subtotal: number
  repriced: number
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Resolve each line item to an authoritative unit price:
 *  1. match by `productId` within the merchant's catalog
 *  2. otherwise match by `sku` within the merchant's catalog
 *  3. otherwise fall back to the client-supplied unit price
 *
 * Catalog prices always win. Returns the re-priced items plus the count of
 * lines that changed versus what the client sent.
 */
export async function resolveItemPrices(params: {
  merchantId: string
  items: PricingItemInput[]
}): Promise<PricingResult> {
  const productIds = params.items.map(i => i.productId).filter((x): x is string => Boolean(x))
  const skus = params.items.map(i => i.sku).filter((x): x is string => Boolean(x))

  const products = await prisma.product.findMany({
    where: {
      merchantId: params.merchantId,
      OR: [
        ...(productIds.length ? [{ id: { in: productIds } }] : []),
        ...(skus.length ? [{ sku: { in: skus } }] : []),
      ],
    },
  })

  const byId = new Map(products.map(p => [p.id, p]))
  const bySku = new Map(products.filter(p => p.sku).map(p => [p.sku as string, p]))

  let subtotal = 0
  let repriced = 0

  const items = params.items.map(raw => {
    const product =
      (raw.productId && byId.get(raw.productId)) || (raw.sku && bySku.get(raw.sku)) || null
    const unitPrice = product ? product.price.toNumber() : Math.max(0, round2(raw.unitPrice ?? 0))
    if (product && Math.round((raw.unitPrice ?? 0) * 100) !== Math.round(unitPrice * 100)) {
      repriced += 1
    }
    const lineTotal = round2(unitPrice * raw.quantity)
    subtotal = round2(subtotal + lineTotal)
    return {
      productId: product?.id ?? raw.productId ?? null,
      productName: raw.productName,
      sku: (product && product.sku) || raw.sku || null,
      quantity: raw.quantity,
      unitPrice,
      lineTotal,
      source: (product ? 'catalog' : 'client') as 'catalog' | 'client',
    }
  })

  return { items, subtotal, repriced }
}

export interface Totals {
  subtotal: number
  discount: number
  shipping: number
  tax: number
  total: number
}

export function computeTotals(params: {
  items: PricedItem[]
  discountAmount?: number
  shippingAmount?: number
  taxAmount?: number
}): Totals {
  const subtotal = params.items.reduce((sum, i) => round2(sum + i.lineTotal), 0)
  const discount = round2(Math.max(0, params.discountAmount ?? 0))
  const shipping = round2(Math.max(0, params.shippingAmount ?? 0))
  const tax = round2(Math.max(0, params.taxAmount ?? 0))
  const total = round2(subtotal - discount + shipping + tax)
  return { subtotal, discount, shipping, tax, total }
}

/** Exact-amount verification with float-tolerant rounding (paise). */
export function verifyAmount(computed: number, provided: number): boolean {
  return Math.round(computed * 100) === Math.round(provided * 100)
}