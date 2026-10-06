import { describe, expect, it } from 'vitest'
import { actionConfirmLabel, actionMessage, actionTitle, canSettle, canUndo } from './transaction-actions'

const NOW = Date.UTC(2026, 9, 7, 6, 0)
const txn = (status: string, overrides: Record<string, unknown> = {}) => ({
  txn_id: 'TXN1', amount: 500, status, customer_name: 'Arjun Mehta', confirmed_at: null, ...overrides,
})

describe('confirm, reject and undo on the dashboard', () => {
  it('offers Confirm and Reject only while a payment is open', () => {
    expect(canSettle(txn('pending'))).toBe(true)
    expect(canSettle(txn('initiated'))).toBe(true)
    expect(canSettle(txn('success'))).toBe(false)
    expect(canSettle(txn('failed'))).toBe(false)
  })

  it('allows Undo for 30 minutes after confirming', () => {
    const confirmedAgo = (m: number) => txn('success', { confirmed_at: new Date(NOW - m * 60_000).toISOString() })
    expect(canUndo(confirmedAgo(10), NOW)).toBe(true)
    expect(canUndo(confirmedAgo(31), NOW)).toBe(false)
    expect(canUndo(txn('success'), NOW)).toBe(false)
    expect(canUndo(txn('pending', { confirmed_at: new Date(NOW).toISOString() }), NOW)).toBe(false)
  })

  it('warns before confirming a payment the customer never marked as sent', () => {
    expect(actionMessage({ txn: txn('initiated'), status: 'success' })).toBe(
      'Only confirm if ₹500 from Arjun Mehta has reached your bank or UPI app. The customer has NOT marked this payment as sent.'
    )
    expect(actionMessage({ txn: txn('pending'), status: 'success' })).toBe(
      'Only confirm if ₹500 from Arjun Mehta has reached your bank or UPI app.'
    )
  })

  it('words Reject and Undo plainly', () => {
    expect(actionMessage({ txn: txn('pending', { customer_name: null }), status: 'failed' })).toBe(
      'Mark ₹500 from this customer as failed? Do this only if the money did not arrive.'
    )
    expect(actionMessage({ txn: txn('success'), status: 'failed', undo: true })).toContain('Use this only if you confirmed it by mistake.')
    expect([actionTitle({ txn: txn('pending'), status: 'success' }), actionConfirmLabel({ txn: txn('pending'), status: 'success' })])
      .toEqual(['Confirm payment?', 'Yes, I received it'])
    expect([actionTitle({ txn: txn('pending'), status: 'failed' }), actionConfirmLabel({ txn: txn('pending'), status: 'failed' })])
      .toEqual(['Reject payment?', 'Reject payment'])
    expect([actionTitle({ txn: txn('success'), status: 'failed', undo: true }), actionConfirmLabel({ txn: txn('success'), status: 'failed', undo: true })])
      .toEqual(['Undo confirmation?', 'Undo confirmation'])
  })
})
