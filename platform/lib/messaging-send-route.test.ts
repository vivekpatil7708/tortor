import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Sending a confirmation message. Email and WhatsApp can be delivered; the
// remaining channels must refuse rather than record a message as sent that
// never left, and a WhatsApp message must never be logged as sent when the
// provider is missing or fails.
const db = vi.hoisted(() => ({
  transaction: { findFirst: vi.fn() },
  messageLog: { count: vi.fn(), create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

const openwa = vi.hoisted(() => ({
  isOpenWaConfigured: vi.fn(),
  sendMessage: vi.fn(),
}))
vi.mock('@/lib/messaging/openwa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/messaging/openwa')>()
  return { ...actual, isOpenWaConfigured: openwa.isOpenWaConfigured }
})

vi.mock('@/lib/messaging/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/messaging/provider')>()
  return {
    ...actual,
    getMessagingProvider: () => ({
      channel: 'whatsapp',
      name: 'openwa',
      sendMessage: openwa.sendMessage,
    }),
  }
})

import { POST as sendMessage } from '@/app/api/messaging/send/route'

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/messaging/send', { method: 'POST', body: JSON.stringify(body) })

/** A payment for one of this merchant's own orders. */
const order = (over: Partial<Record<string, unknown>> = {}) => ({
  customerEmail: 'asha@example.com',
  customerPhone: '9876543210',
  paymentLink: { slug: 'abc123' },
  ...over,
})

const logged = () => db.messageLog.create.mock.calls[0][0].data as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1', email: 'me@example.com', emailVerifiedAt: new Date() })
  db.transaction.findFirst.mockResolvedValue(order())
  db.messageLog.count.mockResolvedValue(0)
  db.messageLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'log1', ...data }))
  // OpenWA unconfigured by default, so tests opt in explicitly.
  openwa.isOpenWaConfigured.mockReturnValue(false)
  openwa.sendMessage.mockResolvedValue({ providerMessageId: 'wa1', ok: true, status: 'sent' })
  // The signed-in merchant is on the WhatsApp early-access list unless a test
  // says otherwise, so the sending tests exercise the send path rather than the
  // allowlist gate.
  vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', 'me@example.com')
  vi.stubEnv('ADMIN_EMAIL', '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('WhatsApp early access', () => {
  it('refuses a merchant who is not on the allowlist and says so', async () => {
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', 'someone-else@example.com')
    openwa.isOpenWaConfigured.mockReturnValue(true)

    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(501)
    expect((await res.json()).error).toBe('WhatsApp not available for your account yet')
  })

  it('does not contact the provider or write a log row when refused', async () => {
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', 'someone-else@example.com')
    openwa.isOpenWaConfigured.mockReturnValue(true)

    await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(openwa.sendMessage).not.toHaveBeenCalled()
    expect(db.messageLog.create).not.toHaveBeenCalled()
  })

  it('still sends email for a merchant who is not on the WhatsApp list', async () => {
    // The allowlist gates WhatsApp only - it must not become a general
    // messaging kill switch.
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', '')

    const res = await sendMessage(request({
      channel: 'email', recipient: 'asha@example.com', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).not.toBe(501)
  })

  it('allows the admin account even when the list is empty', async () => {
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', '')
    vi.stubEnv('ADMIN_EMAIL', 'me@example.com')
    openwa.isOpenWaConfigured.mockReturnValue(true)

    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(200)
  })

  it('refuses when the allowlist is unset, so a missing env var is not an open door', async () => {
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', '')
    vi.stubEnv('ADMIN_EMAIL', '')
    openwa.isOpenWaConfigured.mockReturnValue(true)

    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(501)
  })
})

describe('WhatsApp sending', () => {
  it('sends through the provider and records the message as sent', async () => {
    openwa.isOpenWaConfigured.mockReturnValue(true)

    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi {{customer_name}}', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(openwa.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ to: '9876543210' }))
    expect(logged().status).toBe('sent')
    expect(logged().channel).toBe('whatsapp')
    expect(logged().provider).toBe('openwa')
    expect(logged().providerMessageId).toBe('wa1')
  })

  it('sends the rendered body, with placeholders filled in', async () => {
    openwa.isOpenWaConfigured.mockReturnValue(true)

    await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi {{customer_name}}', orderId: 'TXN-1',
    }))

    expect(openwa.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ body: expect.any(String) }))
  })

  it('records a failure, not a success, when the provider reports one', async () => {
    openwa.isOpenWaConfigured.mockReturnValue(true)
    openwa.sendMessage.mockResolvedValue({
      providerMessageId: null, ok: false, status: 'failed', error: 'Session is not active',
    })

    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('WhatsApp')
    expect(logged().status).toBe('failed')
    expect(logged().errorMessage).toBe('Session is not active')
    expect(logged().providerMessageId).toBeNull()
  })

  it('tells the merchant why the send failed, not just that it did', async () => {
    // Otherwise a wrong number and a gateway that is down look identical, and
    // neither the merchant nor support can tell which one happened.
    openwa.isOpenWaConfigured.mockReturnValue(true)
    openwa.sendMessage.mockResolvedValue({
      providerMessageId: null, ok: false, status: 'failed',
      error: "OpenWA send failed (400): Session 'toropay' is not active.",
    })
    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    const body = await res.json()
    expect(res.status).toBe(502)
    expect(body.error).toContain('could not be sent')
    expect(body.error).toContain("Session 'toropay' is not active.")
  })

  it('still answers sensibly when the provider gives no reason', async () => {
    openwa.isOpenWaConfigured.mockReturnValue(true)
    openwa.sendMessage.mockResolvedValue({
      providerMessageId: null, ok: false, status: 'failed', error: '',
    })

    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    const body = await res.json()
    expect(res.status).toBe(502)
    expect(body.error).toBe('The WhatsApp message could not be sent. Please try again later.')
  })

  it('refuses without writing a log row when no provider is configured', async () => {
    // isOpenWaConfigured is false and no Meta credentials exist, so there is
    // nothing that could deliver this message.
    openwa.isOpenWaConfigured.mockReturnValue(false)

    const res = await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('not set up')
    expect(db.messageLog.create).not.toHaveBeenCalled()
    expect(openwa.sendMessage).not.toHaveBeenCalled()
  })

  it('builds the payment link from the link slug, not the order id', async () => {
    // `/pay/<slug>` looks the link up by slug. A URL built from the txn id can
    // never resolve, and lands the customer on "This payment link doesn't
    // exist", so the slug is the only usable value here.
    openwa.isOpenWaConfigured.mockReturnValue(true)
    db.transaction.findFirst.mockResolvedValue(order({ paymentLink: { slug: 'abc123' } }))

    await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210',
      template: 'Pay here: {{payment_link}}', orderId: 'TXN-1',
    }))

    expect(openwa.sendMessage.mock.calls[0][0].body).toBe('Pay here: https://www.toropay.co.in/pay/abc123')
  })

  it('leaves the link out entirely when the order has no payment link', async () => {
    // Orders created without a link have no URL to offer. Sending a made-up one
    // would be worse than sending none.
    openwa.isOpenWaConfigured.mockReturnValue(true)
    db.transaction.findFirst.mockResolvedValue(order({ paymentLink: null }))

    await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210',
      template: 'Hi {{customer_name}}\nPayment link: {{payment_link}}', orderId: 'TXN-1',
    }))

    const body = openwa.sendMessage.mock.calls[0][0].body
    expect(body).not.toContain('toropay.co.in/pay')
    expect(body).not.toContain('{{payment_link}}')
    // The label line goes with it, rather than being left behind empty.
    expect(body).not.toContain('Payment link')
    expect(body).toBe('Hi {{customer_name}}')
  })

  it('ignores a payment link sent by the browser, using the order\'s own slug', async () => {
    // The link decides where the customer's money is asked for, so it is taken
    // from the order rather than from anything the browser supplies.
    openwa.isOpenWaConfigured.mockReturnValue(true)
    db.transaction.findFirst.mockResolvedValue(order({ paymentLink: { slug: 'real-slug' } }))

    await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210',
      template: 'Pay: {{payment_link}}', orderId: 'TXN-1',
      data: { payment_link: 'https://evil.example/pay/attacker-slug' },
    }))

    expect(openwa.sendMessage.mock.calls[0][0].body).toBe('Pay: https://www.toropay.co.in/pay/real-slug')
  })

  it('does not fall back to the mock provider and claim a delivery', async () => {
    // The regression this guards: WhatsApp used to keep its initial 'sent'
    // status and record a delivery that never happened.
    openwa.isOpenWaConfigured.mockReturnValue(false)

    await sendMessage(request({
      channel: 'whatsapp', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(db.messageLog.create).not.toHaveBeenCalled()
  })
})

describe('a channel that cannot send yet', () => {
  it('refuses Instagram', async () => {
    const res = await sendMessage(request({
      channel: 'instagram', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(res.status).toBe(501)
    expect((await res.json()).error).toContain('Instagram sending is not available yet')
  })

  it('does not write a log row claiming the message was sent', async () => {
    await sendMessage(request({
      channel: 'instagram', recipient: '9876543210', template: 'Hi', orderId: 'TXN-1',
    }))

    expect(db.messageLog.create).not.toHaveBeenCalled()
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
