import { describe, expect, it, vi } from 'vitest'
import {
  CLAIM_FAILED,
  CLAIM_OFFLINE,
  STOP_CHECKING_AFTER_MS,
  claimPaid,
  customerView,
  fetchPaymentStatus,
  nextCheckDelay,
} from './checkout-status'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('how often the payment page checks (B2)', () => {
  it('checks every 3 s, then 10 s, then 30 s, and stops after 30 minutes', () => {
    expect(nextCheckDelay(0)).toBe(3_000)
    expect(nextCheckDelay(2 * 60_000 - 1)).toBe(3_000)
    expect(nextCheckDelay(2 * 60_000)).toBe(10_000)
    expect(nextCheckDelay(10 * 60_000 - 1)).toBe(10_000)
    expect(nextCheckDelay(10 * 60_000)).toBe(30_000)
    expect(nextCheckDelay(STOP_CHECKING_AFTER_MS - 1)).toBe(30_000)
    expect(nextCheckDelay(STOP_CHECKING_AFTER_MS)).toBeNull()
    expect(STOP_CHECKING_AFTER_MS).toBe(30 * 60_000)
  })
})

describe('what a stored status means for the customer (B2)', () => {
  it('keeps waiting only while the payment is open', () => {
    expect(customerView('initiated')).toBe('waiting')
    expect(customerView('pending')).toBe('waiting')
  })

  it('treats a rejected payment as not confirmed instead of waiting forever', () => {
    expect(customerView('success')).toBe('confirmed')
    expect(customerView('failed')).toBe('not-confirmed')
    expect(customerView('something-new')).toBe('not-confirmed')
  })
})

describe('"I\'ve paid" (B4)', () => {
  it('reports success only when the server saved it', async () => {
    const fetchImpl = vi.fn(async () => json(200, { success: true, status: 'pending' }))

    expect(await claimPaid('TXN1', fetchImpl as unknown as typeof fetch)).toEqual({ ok: true, status: 'pending' })
    expect(fetchImpl).toHaveBeenCalledWith('/api/transactions/TXN1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
    }))
  })

  it('shows an error instead of "marked as sent" when the server fails', async () => {
    const fetchImpl = vi.fn(async () => json(500, { error: 'Something went wrong' }))
    expect(await claimPaid('TXN1', fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, error: CLAIM_FAILED })
  })

  it('shows an error when the merchant already settled the payment', async () => {
    const fetchImpl = vi.fn(async () => json(409, { error: 'Transaction already finalized' }))
    expect(await claimPaid('TXN1', fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, error: CLAIM_FAILED })
  })

  it('says so when the phone is offline, instead of hanging', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await claimPaid('TXN1', fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, error: CLAIM_OFFLINE })
  })

  it('never claims success from an unreadable answer', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>proxy error</html>', { status: 200 }))
    expect(await claimPaid('TXN1', fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, error: CLAIM_FAILED })
  })
})

describe('reading the stored status', () => {
  it('returns the status, or null when it cannot be read', async () => {
    const ok = vi.fn(async () => json(200, { status: 'failed', txn_id: 'TXN 1' }))
    expect(await fetchPaymentStatus('TXN 1', ok as unknown as typeof fetch)).toBe('failed')
    expect(ok).toHaveBeenCalledWith('/api/transactions?txn_id=TXN%201', { cache: 'no-store' })

    const missing = vi.fn(async () => json(404, { error: 'Not found' }))
    expect(await fetchPaymentStatus('TXN1', missing as unknown as typeof fetch)).toBeNull()

    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await fetchPaymentStatus('TXN1', offline as unknown as typeof fetch)).toBeNull()
  })
})
