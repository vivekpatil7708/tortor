// Payment-link amounts are rupees stored as floating-point numbers, so every
// amount is kept to whole paise when it's saved or added up. (Orders, products
// and refunds already use exact decimals in the database.)

/** The most one payment link can ask for; the QR code has the same limit. */
export const MAX_LINK_AMOUNT = 10_00_000

/** Rupees rounded to whole paise, e.g. 499.999 → 500 and 19.99 × 3 → 59.97. */
export function roundToPaise(rupees: number): number {
  return Math.round(rupees * 100) / 100
}

export type AmountInput = { ok: true; value: number | null } | { ok: false; error: string }

/**
 * An optional link amount from the dashboard. Missing, empty or 0 means "no fixed
 * amount"; anything else is rounded to paise and must be ₹0.01 to ₹10,00,000.
 */
export function linkAmountInput(value: unknown, label = 'Amount'): AmountInput {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') {
    return { ok: true, value: null }
  }
  const rupees = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  const rounded = Number.isFinite(rupees) ? roundToPaise(rupees) : NaN
  if (!(rounded >= 0.01 && rounded <= MAX_LINK_AMOUNT)) {
    return { ok: false, error: `${label} must be between ₹0.01 and ₹10,00,000` }
  }
  return { ok: true, value: rounded }
}
