export const INVOICE_PREFIX = 'INV'

/**
 * Invoice numbering follows the merchant-facing calendar (Asia/Kolkata), not
 * the server's timezone, so an invoice issued at 00:30 IST on 1 January belongs
 * to the new year.
 */
export function invoiceYear(now: Date): number {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
  }).format(now)
  return Number(formatted)
}

/**
 * Next number in a merchant's series: INV-<year>-0001, INV-<year>-0002, ...
 *
 * The number is derived from the highest number already issued for the year
 * (not from a row count), so gaps left by deleted invoices are not reused.
 * Numbers from other years are ignored, which is what makes the series reset
 * each January.
 */
export function nextInvoiceNumber(issuedNumbers: readonly string[], now: Date = new Date()): string {
  const year = invoiceYear(now)
  const prefix = `${INVOICE_PREFIX}-${year}-`

  const highest = issuedNumbers.reduce((max, number) => {
    if (!number.startsWith(prefix)) return max
    // Accepts both INV-2026-0001 and the older FY-shaped INV-2026-27-0001.
    const match = /-(\d{4,})$/.exec(number)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}
