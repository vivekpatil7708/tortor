import { describe, expect, it } from 'vitest'
import { paymentStatus, STATUS_FILTERS } from './payment-status'

// One set of plain words for payment statuses on every dashboard page (U18).
const NOW = Date.UTC(2026, 9, 7, 6, 0)
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

describe('payment status in plain words', () => {
  it('names each stored status the way a seller would', () => {
    expect(paymentStatus('pending', minutesAgo(1), NOW).label).toBe('Customer says paid')
    expect(paymentStatus('success', minutesAgo(1), NOW).label).toBe('Paid')
    expect(paymentStatus('failed', minutesAgo(1), NOW).label).toBe('Rejected')
    expect(paymentStatus('initiated', minutesAgo(1), NOW).label).toBe('Started')
  })

  it('calls a checkout abandoned after 30 minutes without "I\'ve paid", as Analytics does', () => {
    expect(paymentStatus('initiated', minutesAgo(30), NOW).label).toBe('Started')
    expect(paymentStatus('initiated', minutesAgo(31), NOW).label).toBe('Abandoned')
    expect(paymentStatus('initiated', new Date(NOW - 31 * 60_000), NOW).label).toBe('Abandoned')
    expect(paymentStatus('initiated', null, NOW).label).toBe('Started')
  })

  it('says what to do next', () => {
    expect(paymentStatus('pending', minutesAgo(1), NOW).nextStep).toBe('The customer says they paid. Check your bank or UPI app, then confirm or reject.')
    expect(paymentStatus('initiated', minutesAgo(45), NOW).nextStep).toContain('you can still confirm it')
  })

  it('shows an unexpected status as it is, rather than hiding it', () => {
    expect(paymentStatus('refunded', null, NOW)).toMatchObject({ label: 'refunded', nextStep: '' })
  })

  it('offers a filter tab for every status the server can filter by', () => {
    expect(STATUS_FILTERS.map(f => f.value)).toEqual(['all', 'pending', 'success', 'initiated', 'failed'])
    expect(STATUS_FILTERS.map(f => f.label)).toEqual(['All', 'Customer says paid', 'Paid', 'Started', 'Rejected'])
  })
})
