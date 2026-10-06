import { describe, expect, it } from 'vitest'
import { amountRangeHint, checkoutFormErrors, customFieldKey, type CheckoutFormInput } from './checkout-form'

// The payment-link form shows every problem under its own field at once (U7).
const form = (overrides: Partial<CheckoutFormInput> = {}): CheckoutFormInput => ({
  name: 'Asha Rao', phone: '9876543210', amount: 499, flexible: false, minAmount: null, maxAmount: null,
  hasProducts: false, productChosen: false, customFields: [], fieldValues: {}, ...overrides,
})

describe('checkout form checks', () => {
  it('accepts a complete form', () => {
    expect(checkoutFormErrors(form())).toEqual({})
  })

  it('reports every problem at once, each under its own field', () => {
    const errors = checkoutFormErrors(form({
      name: ' ', phone: '12345',
      customFields: [{ name: 'size', label: 'Size', required: true }, { name: 'gift', label: 'Gift wrap', required: false }],
    }))
    expect(errors).toEqual({
      name: 'Name is required',
      phone: 'Phone must have at least 10 digits',
      [customFieldKey('size')]: '"Size" is required',
    })
  })

  it('gives an example of a valid phone number', () => {
    expect(checkoutFormErrors(form({ phone: '98765 43210 +1' })).phone).toBe('Enter a valid phone number, e.g. 9876543210')
  })

  it("keeps a custom field's problem apart from the built-in fields, even if it is called \"name\"", () => {
    const errors = checkoutFormErrors(form({ customFields: [{ name: 'name', label: 'Name on cake', required: true }] }))
    expect(errors.name).toBeUndefined()
    expect(errors['custom:name']).toBe('"Name on cake" is required')
  })

  it('treats blank text and an empty multi-select as missing', () => {
    const customFields = [{ name: 'note', label: 'Note', required: true }, { name: 'colours', label: 'Colours', required: true }]
    expect(Object.keys(checkoutFormErrors(form({ customFields, fieldValues: { note: '  ', colours: [] } })))).toEqual(
      [customFieldKey('note'), customFieldKey('colours')]
    )
    expect(checkoutFormErrors(form({ customFields, fieldValues: { note: 'Hi', colours: ['Red'] } }))).toEqual({})
  })

  it("checks a customer-entered amount against the link's limits, in rupees", () => {
    const flexible = { flexible: true, minAmount: 10, maxAmount: 5000 }
    expect(checkoutFormErrors(form({ ...flexible, amount: 0 })).amount).toBe('Minimum amount is ₹10')
    expect(checkoutFormErrors(form({ ...flexible, amount: Number.NaN })).amount).toBe('Minimum amount is ₹10')
    expect(checkoutFormErrors(form({ ...flexible, amount: 5000.5 })).amount).toBe('Maximum amount is ₹5,000')
    expect(checkoutFormErrors(form({ ...flexible, amount: 5000 })).amount).toBeUndefined()
    // No minimum set: at least ₹1.
    expect(checkoutFormErrors(form({ flexible: true, amount: 0.5 })).amount).toBe('Minimum amount is ₹1')
  })

  it('asks for an item on product links, and leaves their total to the product prices (as the server does)', () => {
    const products = { hasProducts: true, flexible: true, minAmount: 1000 }
    expect(checkoutFormErrors(form({ ...products, productChosen: false, amount: 0 }))).toEqual({ products: 'Choose at least one item' })
    expect(checkoutFormErrors(form({ ...products, productChosen: true, amount: 250 }))).toEqual({})
  })
})

describe('amount range hint', () => {
  it('describes the limits of a customer-entered amount', () => {
    expect(amountRangeHint(10, 5000)).toBe('Between ₹10 and ₹5,000')
    expect(amountRangeHint(10, null)).toBe('At least ₹10')
    expect(amountRangeHint(null, 5000)).toBe('Up to ₹5,000')
    expect(amountRangeHint(null, undefined)).toBe('')
  })
})
