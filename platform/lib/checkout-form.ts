// The payment-link form's checks, run in the customer's browser before a payment
// starts. The server checks the amount again (lib/link-amount.ts).
import { formatAmount } from './utils'

export type CheckoutFormInput = {
  name: string
  phone: string
  amount: number
  flexible: boolean
  minAmount: number | null
  maxAmount: number | null
  hasProducts: boolean
  productChosen: boolean
  customFields: Array<{ name: string; label: string; required: boolean }>
  fieldValues: Record<string, string | string[]>
}

export function nameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Name is required'
  if (trimmed.length < 2) return 'Name must be at least 2 characters'
  if (trimmed.length > 50) return 'Name must be under 50 characters'
  if (!/^[A-Za-z\s.\-']+$/.test(trimmed)) return 'Name can only contain letters, spaces, dots, hyphens, and apostrophes'
  return null
}

export function phoneProblem(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return 'Phone is required'
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10) return 'Phone must have at least 10 digits'
  if (digits.length > 15) return 'Phone number too long'
  if (!/^\+?\d{1,4}[\d\s\-]{7,15}$/.test(trimmed)) return 'Enter a valid phone number, e.g. 9876543210'
  return null
}

/** The key a custom field's problem is stored under, so it can't clash with name, phone or amount. */
export const customFieldKey = (name: string) => `custom:${name}`

/**
 * Every problem with the form at once, keyed by field: name, phone, amount,
 * products, or customFieldKey(field). Empty when the form can be sent.
 */
export function checkoutFormErrors(form: CheckoutFormInput): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = nameProblem(form.name)
  if (name) errors.name = name
  const phone = phoneProblem(form.phone)
  if (phone) errors.phone = phone
  if (form.hasProducts && !form.productChosen) errors.products = 'Choose at least one item'
  if (form.flexible && !form.hasProducts) {
    const min = form.minAmount || 1
    if (!(form.amount >= min)) errors.amount = `Minimum amount is ${formatAmount(min)}`
    else if (form.maxAmount && form.amount > form.maxAmount) errors.amount = `Maximum amount is ${formatAmount(form.maxAmount)}`
  }
  for (const field of form.customFields) {
    if (!field.required) continue
    const value = form.fieldValues[field.name]
    const empty = !value || (Array.isArray(value) ? value.length === 0 : !value.trim())
    if (empty) errors[customFieldKey(field.name)] = `"${field.label}" is required`
  }
  return errors
}

/** "Between ₹10 and ₹5,000", "At least ₹10", "Up to ₹5,000", or nothing. */
export function amountRangeHint(min: number | null | undefined, max: number | null | undefined): string {
  if (min && max) return `Between ${formatAmount(min)} and ${formatAmount(max)}`
  if (min) return `At least ${formatAmount(min)}`
  if (max) return `Up to ${formatAmount(max)}`
  return ''
}
