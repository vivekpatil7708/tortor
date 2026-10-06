/**
 * Server-side amount check for payment-link checkouts.
 *
 * The customer's browser sends the amount and the products it chose. This
 * recomputes the payable amount from the link itself (fixed amount, min/max,
 * or the link's product prices) so a tampered request cannot change the price.
 * It mirrors the pricing rules of app/pay/[slug]/checkout-client.tsx.
 */

export interface LinkPricing {
  amount: number | null
  amountFlexible: boolean
  minAmount: number | null
  maxAmount: number | null
  /** The link's custom_fields JSON, as stored. */
  customFields: string
}

export interface CheckedProduct {
  name: string
  price: string
  category: string
  quantity: number
}

export type LinkAmountResult =
  | { ok: true; amount: number; products: CheckedProduct[] | null }
  | { ok: false; error: string }

interface LinkProduct {
  name?: unknown
  price?: unknown
  category?: unknown
  quantity?: unknown
}

const toPaise = (value: number) => Math.round(value * 100)

function priceOf(value: unknown): number {
  const n = parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** The checkout labels unnamed products "Item 1", "Item 2", ... */
function nameOf(product: LinkProduct, index: number): string {
  return String(product.name || `Item ${index + 1}`)
}

function linkProducts(customFields: string): LinkProduct[] {
  try {
    const fields = JSON.parse(customFields || '[]') as Array<{ _type?: string; items?: LinkProduct[] }>
    const entry = Array.isArray(fields) ? fields.find(f => f?._type === 'products') : undefined
    return Array.isArray(entry?.items) ? entry.items : []
  } catch {
    return []
  }
}

export function checkLinkAmount(link: LinkPricing, submittedAmount: unknown, submittedProducts: unknown): LinkAmountResult {
  const amount = Number(submittedAmount)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Invalid amount' }

  const products = linkProducts(link.customFields)
  if (products.length > 0) {
    // With stock quantities every product is ordered (1 up to its quantity);
    // otherwise the customer picks products, one of each.
    const quantityMode = products.some(p => Number(p.quantity) > 1)
    const chosen = Array.isArray(submittedProducts) ? (submittedProducts as LinkProduct[]) : []
    if (chosen.length === 0) return { ok: false, error: 'Please select at least one product' }

    const used = new Set<number>()
    const checked: CheckedProduct[] = []
    let total = 0
    for (const item of chosen) {
      const index = products.findIndex((p, i) =>
        !used.has(i) &&
        nameOf(p, i) === String(item?.name ?? '') &&
        toPaise(priceOf(p.price)) === toPaise(priceOf(item?.price))
      )
      if (index === -1) return { ok: false, error: 'Selected products do not match this payment link' }
      used.add(index)

      const product = products[index]
      const limit = quantityMode && Number(product.quantity) > 1 ? Number(product.quantity) : 1
      const quantity = Number(item?.quantity ?? 1)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > limit) {
        return { ok: false, error: 'Invalid product quantity' }
      }

      total += priceOf(product.price) * quantity
      checked.push({
        name: nameOf(product, index),
        price: String(product.price ?? '0'),
        category: String(product.category ?? ''),
        quantity,
      })
    }

    if (toPaise(total) !== toPaise(amount)) return { ok: false, error: 'Amount does not match the selected products' }
    return { ok: true, amount: toPaise(total) / 100, products: checked }
  }

  if (link.amountFlexible) {
    const min = link.minAmount || 1
    if (amount < min) return { ok: false, error: `Minimum amount is ₹${min}` }
    if (link.maxAmount && amount > link.maxAmount) return { ok: false, error: `Maximum amount is ₹${link.maxAmount}` }
    return { ok: true, amount: toPaise(amount) / 100, products: null }
  }

  if (!link.amount || link.amount <= 0) return { ok: false, error: 'This payment link has no amount set' }
  if (toPaise(amount) !== toPaise(link.amount)) return { ok: false, error: 'Amount does not match this payment link' }
  // Whole paise, even for links saved before amounts were rounded.
  return { ok: true, amount: toPaise(link.amount) / 100, products: null }
}
