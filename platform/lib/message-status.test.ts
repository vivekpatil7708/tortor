import { describe, expect, it } from 'vitest'
import { nextStatus } from './message-status'

describe('nextStatus', () => {
  it('moves a sent message on to delivered', () => {
    expect(nextStatus('sent', 'delivered')).toBe('delivered')
  })

  it('moves a delivered message on to read', () => {
    expect(nextStatus('delivered', 'read')).toBe('read')
  })

  it('does not undo a read when a delivery receipt arrives late', () => {
    expect(nextStatus('read', 'delivered')).toBe('read')
  })

  it('does not undo a read when another open arrives', () => {
    expect(nextStatus('read', 'read')).toBe('read')
  })

  it('marks a message as failed whatever it was before', () => {
    expect(nextStatus('sent', 'failed')).toBe('failed')
    expect(nextStatus('pending', 'failed')).toBe('failed')
  })

  it('keeps a message failed', () => {
    expect(nextStatus('failed', 'delivered')).toBe('failed')
  })

  it('does not move a message backwards', () => {
    expect(nextStatus('delivered', 'sent')).toBe('delivered')
  })
})
