import { describe, expect, it } from 'vitest'
import { GST_RATES, GST_STATES, gstinStateCode, isValidGstin, isValidStateCode, isTaxScheme, stateName } from './tax'

describe('GSTIN validation', () => {
  it('accepts the published worked example', () => {
    // The example used in the official checksum explanation: the first 14
    // characters 27AAPFU0939F1Z check against the digit V.
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true)
  })

  it('accepts a second GSTIN built from the same rule', () => {
    expect(isValidGstin('29AAGCB7383J1Z4')).toBe(true)
  })

  it('rejects a GSTIN whose last character was changed', () => {
    // A genuine GSTIN with the check digit swapped, which is the typo this
    // check exists to catch.
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false)
    expect(isValidGstin('29AAGCB7383J1Z6')).toBe(false)
  })

  it('rejects the wrong shape even when the length is right', () => {
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false)      // too short
    expect(isValidGstin('27AAPFU0939F1ZVX')).toBe(false)    // too long
    expect(isValidGstin('7AAPFU0939F1ZV')).toBe(false)      // state code not two digits
    expect(isValidGstin('27AAPFU0939F1Z-')).toBe(false)     // stray character
    expect(isValidGstin('')).toBe(false)
  })

  it('accepts lower case by upper casing first', () => {
    expect(isValidGstin('27aapfu0939f1zv')).toBe(true)
  })

  it('reads the state code out of a valid GSTIN', () => {
    expect(gstinStateCode('27AAPFU0939F1ZV')).toBe('27')
    expect(gstinStateCode('29AAGCB7383J1Z4')).toBe('29')
    // No state code can be trusted from an invalid GSTIN.
    expect(gstinStateCode('27AAPFU0939F1ZX')).toBeNull()
  })
})

describe('state codes', () => {
  it('knows the GST state codes', () => {
    expect(isValidStateCode('27')).toBe(true)   // Maharashtra
    expect(isValidStateCode('07')).toBe(true)   // Delhi
    expect(isValidStateCode('38')).toBe(true)   // Ladakh, the last state code
  })

  it('rejects codes that are not in the published list', () => {
    expect(isValidStateCode('25')).toBe(false)  // not allotted
    expect(isValidStateCode('00')).toBe(false)
    expect(isValidStateCode('Maharashtra')).toBe(false)
  })

  it('does not list the same code twice', () => {
    const codes = GST_STATES.map(s => s.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('turns a code into a name', () => {
    expect(stateName('27')).toBe('Maharashtra')
    expect(stateName('99')).toBe('Centre Jurisdiction')
    expect(stateName(null)).toBeNull()
    expect(stateName('25')).toBeNull()
  })
})

describe('tax scheme', () => {
  it('accepts only the schemes we support', () => {
    expect(isTaxScheme('unregistered')).toBe(true)
    expect(isTaxScheme('regular')).toBe(true)
    expect(isTaxScheme('composition')).toBe(true)
  })

  it('rejects anything else, so a bad value cannot be stored', () => {
    expect(isTaxScheme('gst')).toBe(false)
    expect(isTaxScheme('')).toBe(false)
    expect(isTaxScheme('REGULAR')).toBe(false)
  })
})

describe('GST rates', () => {
  it('lists the rates in normal use, including exempt', () => {
    expect(GST_RATES).toContain(0)
    expect(GST_RATES).toContain(5)
    expect(GST_RATES).toContain(12)
    expect(GST_RATES).toContain(18)
    expect(GST_RATES).toContain(28)
  })

  it('is ordered from lowest to highest', () => {
    const sorted = [...GST_RATES].sort((a, b) => a - b)
    expect([...GST_RATES]).toEqual(sorted)
  })
})
