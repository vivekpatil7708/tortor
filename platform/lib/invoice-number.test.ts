import { describe, expect, it } from 'vitest'
import { invoiceYear, nextInvoiceNumber } from './invoice-number'

describe('invoice numbering', () => {
  it('starts a merchant series at INV-2026-0001', () => {
    expect(nextInvoiceNumber([], new Date('2026-10-25T10:00:00+05:30'))).toBe('INV-2026-0001')
  })

  it('continues from the highest number already issued', () => {
    expect(
      nextInvoiceNumber(
        ['INV-2026-0001', 'INV-2026-0007', 'INV-2026-0003'],
        new Date('2026-10-25T10:00:00+05:30')
      )
    ).toBe('INV-2026-0008')
  })

  it('resets when the year rolls over', () => {
    expect(
      nextInvoiceNumber(
        ['INV-2025-0001', 'INV-2025-0002', 'INV-2026-0001'],
        new Date('2026-01-02T10:00:00+05:30')
      )
    ).toBe('INV-2026-0002')
  })

  it('uses the new year for an invoice issued just after midnight IST', () => {
    // 31 Dec 2025 20:00 UTC is 1 Jan 2026 01:30 IST.
    const justAfterMidnightIst = new Date('2025-12-31T20:00:00Z')
    expect(invoiceYear(justAfterMidnightIst)).toBe(2026)
    expect(nextInvoiceNumber(['INV-2025-0009'], justAfterMidnightIst)).toBe('INV-2026-0001')
  })

  it('keeps numbering after invoices created in the old financial-year format', () => {
    expect(
      nextInvoiceNumber(
        ['INV-2026-27-0001', 'INV-2026-27-0002'],
        new Date('2026-10-25T10:00:00+05:30')
      )
    ).toBe('INV-2026-0003')
  })

  it('does not reuse the gap left by a deleted invoice', () => {
    // 0002 was issued and then removed; the series continues from the highest
    // remaining number instead of filling the gap.
    expect(
      nextInvoiceNumber(['INV-2026-0001', 'INV-2026-0003'], new Date('2026-10-25T10:00:00+05:30'))
    ).toBe('INV-2026-0004')
  })

  it('pads to four digits and does not truncate past 9999', () => {
    expect(nextInvoiceNumber(['INV-2026-9999'], new Date('2026-05-01T00:00:00+05:30'))).toBe(
      'INV-2026-10000'
    )
  })
})
