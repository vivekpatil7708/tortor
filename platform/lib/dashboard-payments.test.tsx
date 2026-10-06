import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement('a', { href, className }, children),
}))
vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))

import { shouldShowDonation, SNOOZE_DAYS } from '@/components/dashboard/donation-prompt'
import { NeedsAction } from '@/components/dashboard/needs-action'
import { NextStepCard, TransactionRow } from '@/components/dashboard/transaction-row'

// The dashboard's payment lists (U13, U14, U18, U19, U20) and the donation card (U15).
const NOW = Date.UTC(2026, 9, 7, 6, 0)
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()
const txn = (status: string, overrides: Record<string, unknown> = {}) => ({
  id: `id-${status}`, txn_id: `TXN${status.toUpperCase()}1`, amount: 500, status,
  customer_name: 'Arjun Mehta', customer_phone: '+919900112233', created_at: ago(5), confirmed_at: null,
  ...overrides,
})
const noop = () => {}
const row = (t: Record<string, unknown>) => renderToStaticMarkup(<TransactionRow txn={t} onAction={noop} onSend={noop} now={NOW} />)
const nextStep = (t: Record<string, unknown>) => renderToStaticMarkup(<NextStepCard txn={t} onAction={noop} onSend={noop} now={NOW} />)
/** The text of every button, icons left out. */
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())

describe('Transactions rows', () => {
  it('lead with Confirm and Reject when the customer says they paid', () => {
    const html = row(txn('pending'))
    expect(html).toContain('Customer says paid')
    expect(buttons(html)).toEqual(['Confirm', 'Reject'])
  })

  it('keep Confirm and Reject under More for a checkout that was only started', () => {
    const html = row(txn('initiated'))
    expect(html).toContain('Started')
    expect(buttons(html)).toEqual(['More'])
    expect(row(txn('initiated', { created_at: ago(45) }))).toContain('Abandoned')
  })

  it('offer "Send receipt" only once paid, and Undo for 30 minutes after confirming', () => {
    expect(buttons(row(txn('success', { confirmed_at: ago(10) })))).toEqual(['Send receipt', 'Undo'])
    expect(buttons(row(txn('success', { confirmed_at: ago(40) })))).toEqual(['Send receipt'])
    expect(buttons(row(txn('failed')))).toEqual([])
    expect(row(txn('failed'))).toContain('Rejected')
  })

  it('use plain words: no raw status codes and no "Settlement" line', () => {
    for (const status of ['initiated', 'pending', 'success', 'failed']) {
      const html = row(txn(status))
      expect(html).not.toContain('Settlement')
      expect(html).not.toMatch(/>(initiated|pending|success|failed)</)
    }
  })

  it("link to each payment's own page", () => {
    expect(row(txn('pending'))).toContain('href="/dashboard/transactions/TXNPENDING1"')
  })
})

describe('Needs your action on Overview', () => {
  const checkout = { id: 'p1', payment_reference: 'TP-REF-1', order_number: '1042', amount: 1200, created_at: ago(3) }

  it('lists link payments with Confirm and Reject, and website payments with Confirm', () => {
    const html = renderToStaticMarkup(
      <NeedsAction linkPayments={[txn('pending')]} linkTotal={1} checkoutPayments={[checkout]} onAction={noop} onConfirmCheckout={noop} />
    )
    expect(html).toContain('Needs your action (2)')
    expect(html).toContain('Arjun Mehta')
    expect(html).toContain('Website order 1042')
    expect(buttons(html)).toEqual(['Confirm', 'Reject', 'Confirm paid'])
    expect(html).not.toContain('View all')
  })

  it('counts every waiting payment and links to the rest', () => {
    const html = renderToStaticMarkup(
      <NeedsAction linkPayments={[txn('pending')]} linkTotal={14} checkoutPayments={[]} onAction={noop} onConfirmCheckout={noop} />
    )
    expect(html).toContain('Needs your action (14)')
    expect(html).toContain('href="/dashboard/transactions?status=pending"')
  })

  it('stays out of the way when nothing is waiting', () => {
    expect(renderToStaticMarkup(
      <NeedsAction linkPayments={[]} linkTotal={0} checkoutPayments={[]} onAction={noop} onConfirmCheckout={noop} />
    )).toBe('')
  })
})

describe("a payment's own page", () => {
  it('says what to do next, with the actions that apply', () => {
    const waiting = nextStep(txn('pending'))
    expect(waiting).toContain('The customer says they paid. Check your bank or UPI app, then confirm or reject.')
    expect(buttons(waiting)).toEqual(['Confirm payment', 'Reject'])

    expect(buttons(nextStep(txn('initiated')))).toEqual(['Confirm payment', 'Reject'])
    expect(buttons(nextStep(txn('success', { confirmed_at: ago(5) })))).toEqual(['Undo confirmation', 'Send receipt'])
    expect(buttons(nextStep(txn('failed')))).toEqual([])
  })
})

describe('donation card', () => {
  const day = 24 * 60 * 60_000
  it('appears after 3 paid payments', () => {
    expect(shouldShowDonation(2, null, null, NOW)).toBe(false)
    expect(shouldShowDonation(3, null, null, NOW)).toBe(true)
  })

  it('stays hidden for 30 days after "Maybe later", and for good after "Don\'t show again"', () => {
    expect(SNOOZE_DAYS).toBe(30)
    expect(shouldShowDonation(10, null, String(NOW + 29 * day), NOW)).toBe(false)
    expect(shouldShowDonation(10, null, String(NOW - 1), NOW)).toBe(true)
    expect(shouldShowDonation(10, 'true', null, NOW)).toBe(false)
    expect(shouldShowDonation(10, null, 'not a date', NOW)).toBe(true)
  })
})
