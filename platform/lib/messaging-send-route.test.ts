import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Sending a confirmation message. Only email can actually be delivered, so the
// other channels must refuse rather than record a message as sent that never left.
const db = vi.hoisted(() => ({
  transaction: { findFirst: vi.fn() },
  messageLog: { count: vi.fn(), create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

import { POST as sendMessage } from '@/app/api/messaging/send/route'

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/messaging/send', { method: 'POST', body: JSON.stringify(body) })

/** A payment for one of this merchant's own orders. */
const order = (over: Partial<Record<string, unknown>> = {}) => ({
  customerEmail: 'asha@example.com',
  customerPhone: '9876543210',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1', email: 'me@example.com', emailVerifiedAt: new Date() })
  db.transaction.findFirst.mockResolvedValue(order())
  db.messageLog.count.mockResolvedValue(0)
  db.messageLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'log1', ...data }))
})

afterEach(() => vi.restoreAllMocks())

describe('a channel that cannot send yet', () => {
  it('refuses a WhatsApp message and says so', async () => {
    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi {{customer_name}}', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.error).toContain('WhatsApp sending is not available yet')
    expect(body.error).toContain('was not sent')
  })

  it('does not write a log row claiming the message was sent', async () => {
    // This is the bug being fixed: WhatsApp used to fall through every branch,
    // keep its initial status of 'sent', and quietly record a delivery that
    // never happened.
    await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(db.messageLog.create).not.toHaveBeenCalled()
  })

  it('refuses Instagram in the same way', async () => {
    const res = await sendMessage(request({
      channel: 'instagram', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(501)
    expect((await res.json()).error).toContain('Instagram sending is not available yet')
  })

  it('names an unknown channel rather than sending it', async () => {
    const res = await sendMessage(request({
      channel: 'telegram', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(501)
    expect((await res.json()).error).toContain('telegram sending is not available yet')
  })
})

describe('email still behaves as before', () => {
  it('rejects a recipient who is not the customer on this order', async () => {
    const res = await sendMessage(request({
      channel: 'email', recipient: 'someone-else@example.com', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("only be sent to this order's customer")
    expect(db.messageLog.create).not.toHaveBeenCalled()
  })

  it('rejects an order that does not belong to this merchant', async () => {
    db.transaction.findFirst.mockResolvedValue(null)

    const res = await sendMessage(request({
      channel: 'email', recipient: 'asha@example.com', template: 'Hi', orderId: 'SOMEONE-ELSES',
    }))

    expect(res.status).toBe(404)
  })

  it('refuses once the daily email limit is reached', async () => {
    db.messageLog.count.mockResolvedValue(100)

    const res = await sendMessage(request({
      channel: 'email', recipient: 'asha@example.com', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(429)
    expect(db.messageLog.create).not.toHaveBeenCalled()
  })

  it('records a failure, not a success, when email sending is not set up', async () => {
    // No RESEND_API_KEY in the test environment, so this is the real path.
    const res = await sendMessage(request({
      channel: 'email', recipient: 'asha@example.com', subject: 'Your order', template: 'Hi {{customer_name}}', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(502)
    expect(db.messageLog.create).toHaveBeenCalledTimes(1)
    const logged = db.messageLog.create.mock.calls[0][0].data as Record<string, unknown>
    expect(logged.status).toBe('failed')
    expect(logged.channel).toBe('email')
    expect(logged.errorMessage).toBe('Email sending is not set up')
  })
})

describe('required fields', () => {
  it('asks for the fields it needs', async () => {
    const res = await sendMessage(request({ channel: 'email' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('required')
  })

  it('will not send anything without a signed-in merchant', async () => {
    auth.requireSession.mockRejectedValue(new Error('Unauthorized'))

    const res = await sendMessage(request({
      channel: 'email', recipient: 'asha@example.com', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(401)
  })
})
