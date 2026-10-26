/**
 * Tax details for Indian GST.
 *
 * This module deliberately holds *structure*, not policy. It knows what a GSTIN
 * looks like and which state codes exist, because those are fixed published
 * facts. It does NOT decide how much tax to charge, how to split CGST/SGST vs
 * IGST, or how to number invoices - those depend on decisions a merchant must
 * make (registration type, place of supply, rate per product) and on rules not
 * yet settled. Guessing them would produce plausible but wrong legal documents.
 *
 * What is safe today: collecting and validating these details, and reporting the
 * tax that was recorded on orders.
 */

/** The GSTIN layout: 2 digit state, 10 char PAN, entity number, Z, checksum. */
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

/** Characters used by the GSTIN checksum (base 36, digits then letters). */
const CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * The official GSTIN checksum: the first 14 characters weighted alternately
 * 1 and 2, each weighted value reduced to its base-36 digits and summed, and
 * the character then found by subtracting the remainder from 36.
 *
 * The subtraction is essential. Publishing the remainder directly (rather than
 * 36 minus the remainder) produces a check digit that looks like a real one but
 * rejects every genuine GSTIN.
 */
function gstinChecksum(first14: string): string {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const code = CHECKSUM_CHARS.indexOf(first14[i])
    if (code < 0) return ''
    const weighted = code * (i % 2 === 0 ? 1 : 2)
    // A value of 36 or more carries into the next base-36 place.
    sum += Math.floor(weighted / 36) + (weighted % 36)
  }
  const remainder = sum % 36
  return CHECKSUM_CHARS[(36 - remainder) % 36]
}

/**
 * True when a GSTIN is structurally valid and its checksum matches.
 * An invalid GSTIN on an invoice is worse than none, so we check both.
 */
export function isValidGstin(value: string): boolean {
  const gstin = value.trim().toUpperCase()
  if (!GSTIN_FORMAT.test(gstin)) return false
  return gstinChecksum(gstin.slice(0, 14)) === gstin[14]
}

/** The state code embedded in a GSTIN, or null when it is not valid. */
export function gstinStateCode(value: string): string | null {
  const gstin = value.trim().toUpperCase()
  return isValidGstin(gstin) ? gstin.slice(0, 2) : null
}

/**
 * Indian state codes, as published for GST. Used to show a picker and to label
 * an order's place of supply. Two digit codes run 01 to 38, plus 97 (Other
 * Territory) and 99 (Centre Jurisdiction) for special cases.
 */
export const GST_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
  { code: '99', name: 'Centre Jurisdiction' },
]

const STATE_CODES = new Set(GST_STATES.map(s => s.code))

export function isValidStateCode(value: string): boolean {
  return STATE_CODES.has(value.trim())
}

export function stateName(code: string | null | undefined): string | null {
  if (!code) return null
  return GST_STATES.find(s => s.code === code)?.name ?? null
}

/**
 * Resolve either a GST state code ("27") or a state name ("Maharashtra") to the
 * code. Order address snapshots store the name the customer picked, so invoice
 * tax splits need this to compare the buyer's state with the seller's.
 */
export function resolveStateCode(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const byCode = GST_STATES.find(s => s.code === trimmed)
  if (byCode) return byCode.code
  const normalized = trimmed.toLowerCase()
  return GST_STATES.find(s => s.name.toLowerCase() === normalized)?.code ?? null
}

/** How a merchant is registered, which decides the kind of document they may issue. */
export const TAX_SCHEMES = [
  { value: 'unregistered', label: 'Not registered for GST' },
  { value: 'regular', label: 'Registered - regular scheme' },
  { value: 'composition', label: 'Registered - composition scheme' },
] as const

export type TaxScheme = (typeof TAX_SCHEMES)[number]['value']

export function isTaxScheme(value: string): value is TaxScheme {
  return TAX_SCHEMES.some(s => s.value === value)
}

/**
 * The GST rates in normal use, plus exempt. Offered as the choices a merchant
 * picks from; this is a list of valid values, not a suggestion of which applies.
 */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const

/**
 * What still has to be decided before ToroPay can issue a GST invoice.
 * Surfaced in the UI so the gap is visible rather than silently guessed.
 */
export const TAX_OPEN_QUESTIONS = [
  'Whether to charge tax at all, and at which rate per product, for a registered merchant.',
  'How to split CGST and SGST for a sale inside the merchant state, and IGST for a sale across states.',
  'The invoice number series, including how it restarts each financial year and how gaps are avoided.',
  'How credit notes for refunds and cancellations reference the original invoice.',
] as const
