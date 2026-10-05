import { describe, expect, it } from 'vitest'
import type { PaymentStatus } from '@prisma/client'
import { CONFIRM_UNDO_MINUTES, decideLinkPaymentChange, decidePaymentStatusChange } from './payment-transitions'

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0)
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)

describe('payment-link status changes', () => {
  const merchant = (from: string, to: 'pending' | 'success' | 'failed', confirmedAt?: Date | null) =>
    decideLinkPaymentChange({ from, to, by: 'merchant', confirmedAt, now: NOW }).action

  it('lets the merchant settle an open payment', () => {
    expect(merchant('initiated', 'success')).toBe('apply')
    expect(merchant('pending', 'success')).toBe('apply')
    expect(merchant('initiated', 'failed')).toBe('apply')
    expect(merchant('pending', 'failed')).toBe('apply')
  })

  it('lets a failed payment become successful when the money arrives late', () => {
    expect(merchant('failed', 'success')).toBe('apply')
  })

  it('treats the same status again as no change', () => {
    expect(merchant('success', 'success', minutesAgo(1))).toBe('unchanged')
    expect(merchant('failed', 'failed')).toBe('unchanged')
    expect(decideLinkPaymentChange({ from: 'pending', to: 'pending', by: 'customer' }).action).toBe('unchanged')
  })

  it(`allows undoing a confirmation only within ${CONFIRM_UNDO_MINUTES} minutes`, () => {
    expect(merchant('success', 'failed', minutesAgo(5))).toBe('apply')
    expect(merchant('success', 'failed', minutesAgo(CONFIRM_UNDO_MINUTES))).toBe('apply')
    expect(merchant('success', 'failed', minutesAgo(CONFIRM_UNDO_MINUTES + 1))).toBe('blocked')
    expect(merchant('success', 'failed', null)).toBe('blocked')
  })

  it('never moves a settled payment back to pending', () => {
    expect(merchant('success', 'pending', minutesAgo(1))).toBe('blocked')
    expect(merchant('failed', 'pending')).toBe('blocked')
    const customer = decideLinkPaymentChange({ from: 'success', to: 'pending', by: 'customer' })
    expect(customer).toEqual({ action: 'blocked', reason: 'Transaction already finalized' })
  })

  it('lets a customer only declare an open payment as sent', () => {
    expect(decideLinkPaymentChange({ from: 'initiated', to: 'pending', by: 'customer' }).action).toBe('apply')
    expect(decideLinkPaymentChange({ from: 'pending', to: 'success', by: 'customer' }).action).toBe('blocked')
  })
})

describe('provider payment status changes', () => {
  const decide = (from: PaymentStatus, to: PaymentStatus) => decidePaymentStatusChange(from, to).action

  it('ignores a late "failed" or "pending" for a paid payment', () => {
    expect(decide('paid', 'failed')).toBe('blocked')
    expect(decide('paid', 'pending')).toBe('blocked')
    expect(decide('paid', 'expired')).toBe('blocked')
    expect(decide('paid', 'processing')).toBe('blocked')
  })

  it('lets a paid payment move on to refund or dispute', () => {
    expect(decide('paid', 'refunded')).toBe('apply')
    expect(decide('paid', 'partially_refunded')).toBe('apply')
    expect(decide('paid', 'disputed')).toBe('apply')
    expect(decide('partially_refunded', 'refunded')).toBe('apply')
    expect(decide('disputed', 'paid')).toBe('apply')
  })

  it('lets open payments settle, and failed or expired ones still be paid', () => {
    expect(decide('pending', 'paid')).toBe('apply')
    expect(decide('processing', 'failed')).toBe('apply')
    expect(decide('failed', 'paid')).toBe('apply')
    expect(decide('expired', 'paid')).toBe('apply')
  })

  it('keeps refunded final and never goes back to pending', () => {
    expect(decide('refunded', 'paid')).toBe('blocked')
    expect(decide('failed', 'pending')).toBe('blocked')
    expect(decide('processing', 'pending')).toBe('blocked')
    expect(decide('paid', 'paid')).toBe('unchanged')
  })
})
