import { describe, expect, it } from 'vitest'
import {
  eventEmail,
  eventMessageId,
  resendEventAction,
  suppressionReason,
} from './resend-events'

describe('resendEventAction', () => {
  it('marks a delivered email as delivered', () => {
    expect(resendEventAction({ type: 'email.delivered' })).toEqual({ kind: 'delivered' })
  })

  it('marks an opened email as opened', () => {
    expect(resendEventAction({ type: 'email.opened' })).toEqual({ kind: 'opened' })
  })

  it('treats a hard bounce as a bounce', () => {
    const action = resendEventAction({
      type: 'email.bounced',
      data: { bounce: { message: 'Mailbox does not exist', type: 'hard' } },
    })
    expect(action).toEqual({ kind: 'bounced', reason: 'Mailbox does not exist', hard: true })
  })

  it('treats a soft bounce as a bounce that does not suppress', () => {
    const action = resendEventAction({
      type: 'email.bounced',
      data: { bounce: { message: 'Mailbox full', type: 'soft' } },
    })
    expect(action).toEqual({ kind: 'bounced', reason: 'Mailbox full', hard: false })
  })

  it('treats a spam complaint as a complaint', () => {
    const action = resendEventAction({ type: 'email.complained' })
    expect(action.kind).toBe('complained')
  })

  it('treats a failed send as failed', () => {
    const action = resendEventAction({ type: 'email.failed', data: { failed: { reason: 'Bad request' } } })
    expect(action).toEqual({ kind: 'failed', reason: 'Bad request' })
  })

  it('ignores the events that do not change the state of a message', () => {
    for (const type of ['email.sent', 'email.scheduled', 'email.clicked', 'email.delivery_delayed', 'contact.created']) {
      expect(resendEventAction({ type })).toEqual({ kind: 'ignored' })
    }
  })
})

describe('suppressionReason', () => {
  it('suppresses after a hard bounce', () => {
    expect(suppressionReason({ kind: 'bounced', reason: 'gone', hard: true })).toBe('bounced')
  })

  it('does not suppress after a soft bounce', () => {
    expect(suppressionReason({ kind: 'bounced', reason: 'full', hard: false })).toBeNull()
  })

  it('suppresses after a complaint', () => {
    expect(suppressionReason({ kind: 'complained', reason: 'spam' })).toBe('complained')
  })

  it('does not suppress after a delivery', () => {
    expect(suppressionReason({ kind: 'delivered' })).toBeNull()
  })
})

describe('eventEmail and eventMessageId', () => {
  it('reads the address the event is about', () => {
    expect(eventEmail({ type: 'email.delivered', data: { to: ['Owner@MyStore.in'] } })).toBe('owner@mystore.in')
  })

  it('has no address when the event has none', () => {
    expect(eventEmail({ type: 'email.delivered' })).toBeNull()
  })

  it('reads the provider message id', () => {
    expect(eventMessageId({ type: 'email.delivered', data: { email_id: 'abc-123' } })).toBe('abc-123')
  })
})
