import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Webhook } from 'standardwebhooks'
import { prisma } from '@/lib/prisma'
import { dispatchCampaign } from '@/lib/broadcast-campaign'
import { createMerchant, request } from './helpers'

const { sendMock, adminRef } = vi.hoisted(() => ({
  // The Resend SDK answers with either a payload or an error, never both.
  sendMock: vi.fn(async (): Promise<{ data: { id: string } | null; error: { message: string } | null }> => ({
    data: { id: 'provider-message-1' },
    error: null,
  })),
  adminRef: { current: { id: '', email: '' } },
}))

// The email provider is replaced, but its signature check is the real one.
vi.mock('resend', async (importOriginal) => {
  const real = await importOriginal<typeof import('resend')>()
  const instance = new real.Resend('test-key')
  return {
    Resend: class {
      emails = { send: sendMock }
      webhooks = instance.webhooks
    },
  }
})

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => adminRef.current),
  isAdminEmail: vi.fn(() => true),
  hasAdminSecondFactor: vi.fn(async () => true),
}))

const WEBHOOK_SECRET = `whsec_${Buffer.from('resend-webhook-secret').toString('base64')}`

beforeAll(() => {
  process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.RESEND_API_KEY = 'test-key'
})

beforeEach(async () => {
  // Only the tables this file touches. Emptying every table in the database
  // for each test is far slower.
  await prisma.$executeRawUnsafe('TRUNCATE "merchants", "email_suppressions" CASCADE')
  sendMock.mockClear()
  sendMock.mockImplementation(async () => ({ data: { id: 'provider-message-1' }, error: null }))
  const admin = await prisma.merchant.create({
    // Suspended so the admin's own account is never a recipient.
    data: { email: 'admin@toropay.co.in', businessName: 'Admin', emailVerifiedAt: new Date(), status: 'suspended' },
  })
  adminRef.current = { id: admin.id, email: admin.email }
})

async function createCampaign(data: Partial<{ name: string; subject: string; body: string; audience: object }> = {}) {
  return prisma.broadcastCampaign.create({
    data: {
      name: data.name ?? 'October update',
      subject: data.subject ?? 'Hello {{merchant_name}}',
      body: data.body ?? 'Your payment link: {{payment_link}}',
      audience: JSON.stringify(data.audience ?? { status: 'active' }),
      createdBy: adminRef.current.email,
      status: 'draft',
    },
  })
}

describe('dispatching a campaign', () => {
  it('sends to every merchant the audience matches and records a row for each', async () => {
    await createMerchant()
    await createMerchant()
    await prisma.merchant.create({ data: { email: 'suspended@example.com', businessName: 'Suspended', status: 'suspended' } })
    const campaign = await createCampaign()

    const result = await dispatchCampaign(campaign.id)

    expect(result.total).toBe(2)
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.remaining).toBe(0)
    expect(sendMock).toHaveBeenCalledTimes(2)

    const logs = await prisma.messageLog.findMany({ where: { campaignId: campaign.id } })
    expect(logs).toHaveLength(2)
    expect(logs.every(log => log.status === 'sent')).toBe(true)
    expect(logs.every(log => log.providerMessageId === 'provider-message-1')).toBe(true)
    expect(logs.every(log => log.idempotencyKey === `${campaign.id}:${log.merchantId}`)).toBe(true)
  })

  it('fills the template in for each merchant', async () => {
    const merchant = await createMerchant()
    await prisma.merchant.update({ where: { id: merchant.id }, data: { businessName: 'My Store' } })
    const campaign = await createCampaign()

    await dispatchCampaign(campaign.id)

    const log = await prisma.messageLog.findFirst({ where: { campaignId: campaign.id } })
    expect(log?.subject).toBe('Hello My Store')
    expect(log?.renderedBody).toContain('http://localhost:3000')
    expect(log?.renderedBody).not.toContain('{{')
  })

  it('does not send the same message twice when the campaign is sent again', async () => {
    await createMerchant()
    const campaign = await createCampaign()

    await dispatchCampaign(campaign.id)
    sendMock.mockClear()
    const second = await dispatchCampaign(campaign.id)

    expect(sendMock).not.toHaveBeenCalled()
    expect(second.remaining).toBe(0)
    expect(await prisma.messageLog.count({ where: { campaignId: campaign.id } })).toBe(1)
  })

  it('leaves a message failed when the provider refuses it', async () => {
    await createMerchant()
    sendMock.mockImplementation(async () => ({ data: null, error: { message: 'Address is not valid' } }))
    const campaign = await createCampaign()

    const result = await dispatchCampaign(campaign.id)

    expect(result.failed).toBe(1)
    expect(result.sent).toBe(0)
    const log = await prisma.messageLog.findFirst({ where: { campaignId: campaign.id } })
    expect(log?.status).toBe('failed')
    expect(log?.errorMessage).toBe('Address is not valid')
  })

  it('does not email an address that is on the suppression list', async () => {
    const merchant = await createMerchant()
    await prisma.emailSuppression.create({ data: { email: merchant.email, reason: 'bounced', source: 'resend' } })
    const campaign = await createCampaign()

    const result = await dispatchCampaign(campaign.id)

    expect(result.total).toBe(0)
    expect(result.suppressed).toBe(1)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('marks the campaign as sent once everything has gone out', async () => {
    await createMerchant()
    const campaign = await createCampaign()

    await dispatchCampaign(campaign.id)

    const updated = await prisma.broadcastCampaign.findUnique({ where: { id: campaign.id } })
    expect(updated?.status).toBe('sent')
    expect(updated?.sentCount).toBe(1)
    expect(updated?.sentAt).not.toBeNull()
  })
})

describe('the open tracking pixel', () => {
  async function openIt(messageLogId: string, userAgent: string, ip: string) {
    const { GET } = await import('@/app/api/admin/email/open/[messageLogId]/route')
    return GET(
      request(`/api/admin/email/open/${messageLogId}`, { headers: { 'user-agent': userAgent, 'x-forwarded-for': ip } }),
      { params: Promise.resolve({ messageLogId }) }
    )
  }

  async function createLog() {
    const merchant = await createMerchant()
    return prisma.messageLog.create({
      data: {
        merchantId: merchant.id,
        channel: 'email',
        recipient: merchant.email,
        subject: 'Hello',
        renderedBody: 'Hello',
        status: 'sent',
        provider: 'resend',
        createdBy: 'admin',
      },
    })
  }

  it('records a read and marks the message as read', async () => {
    const log = await createLog()

    const response = await openIt(log.id, 'Mozilla/5.0 (Macintosh) Safari/605.1.15', '1.2.3.4')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    const updated = await prisma.messageLog.findUnique({ where: { id: log.id } })
    expect(updated?.readAt).not.toBeNull()
    expect(updated?.status).toBe('read')
    expect(await prisma.messageOpenEvent.count({ where: { messageLogId: log.id } })).toBe(1)
  })

  it('does not count the same address opening the same email twice', async () => {
    const log = await createLog()

    await openIt(log.id, 'Mozilla/5.0 (Macintosh) Safari/605.1.15', '1.2.3.4')
    await openIt(log.id, 'Mozilla/5.0 (Macintosh) Safari/605.1.15', '1.2.3.4')

    expect(await prisma.messageOpenEvent.count({ where: { messageLogId: log.id } })).toBe(1)
  })

  it('does not count a mail client that fetches the image on its own', async () => {
    const log = await createLog()

    await openIt(log.id, 'Mozilla/5.0 (compatible; Google-PageRenderer) prefetch', '5.6.7.8')

    expect(await prisma.messageOpenEvent.count({ where: { messageLogId: log.id } })).toBe(0)
    const updated = await prisma.messageLog.findUnique({ where: { id: log.id } })
    expect(updated?.readAt).toBeNull()
  })

  it('still answers with a pixel for a message that does not exist', async () => {
    const response = await openIt('00000000-0000-0000-0000-000000000000', 'Mozilla/5.0', '1.2.3.4')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })
})

describe('the Resend webhook', () => {
  function signedRequest(event: object) {
    const payload = JSON.stringify(event)
    const timestamp = new Date()
    const signature = new Webhook(WEBHOOK_SECRET).sign('message-1', timestamp, payload)
    return request('/api/webhooks/resend', {
      method: 'POST',
      body: payload,
      headers: {
        'svix-id': 'message-1',
        'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'svix-signature': signature,
      },
    })
  }

  async function createSentLog(providerMessageId: string) {
    const merchant = await createMerchant()
    return prisma.messageLog.create({
      data: {
        merchantId: merchant.id,
        channel: 'email',
        recipient: merchant.email,
        subject: 'Hello',
        renderedBody: 'Hello',
        status: 'sent',
        provider: 'resend',
        providerMessageId,
        createdBy: 'admin',
      },
    })
  }

  it('marks a message as delivered', async () => {
    const log = await createSentLog('provider-message-1')

    const { POST } = await import('@/app/api/webhooks/resend/route')
    const response = await POST(
      signedRequest({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 'provider-message-1', to: [log.recipient], from: 'x@y.z', subject: 'Hello', created_at: new Date().toISOString() },
      })
    )

    expect(response.status).toBe(200)
    const updated = await prisma.messageLog.findUnique({ where: { id: log.id } })
    expect(updated?.status).toBe('delivered')
    expect(updated?.deliveredAt).not.toBeNull()
  })

  it('marks a message as read when it is opened', async () => {
    const log = await createSentLog('provider-message-1')

    const { POST } = await import('@/app/api/webhooks/resend/route')
    await POST(
      signedRequest({
        type: 'email.opened',
        created_at: new Date().toISOString(),
        data: { email_id: 'provider-message-1', to: [log.recipient], from: 'x@y.z', subject: 'Hello', created_at: new Date().toISOString() },
      })
    )

    const updated = await prisma.messageLog.findUnique({ where: { id: log.id } })
    expect(updated?.status).toBe('read')
    expect(updated?.readAt).not.toBeNull()
  })

  it('marks a bounced message as failed and stops emailing the address', async () => {
    const log = await createSentLog('provider-message-1')

    const { POST } = await import('@/app/api/webhooks/resend/route')
    await POST(
      signedRequest({
        type: 'email.bounced',
        created_at: new Date().toISOString(),
        data: {
          email_id: 'provider-message-1',
          to: [log.recipient],
          from: 'x@y.z',
          subject: 'Hello',
          created_at: new Date().toISOString(),
          bounce: { message: 'Mailbox does not exist', type: 'hard' },
        },
      })
    )

    const updated = await prisma.messageLog.findUnique({ where: { id: log.id } })
    expect(updated?.status).toBe('failed')
    expect(updated?.errorMessage).toBe('Mailbox does not exist')
    const suppression = await prisma.emailSuppression.findUnique({ where: { email: log.recipient.toLowerCase() } })
    expect(suppression?.reason).toBe('bounced')
  })

  it('refuses a request that is not signed with the secret', async () => {
    const { POST } = await import('@/app/api/webhooks/resend/route')
    const response = await POST(
      request('/api/webhooks/resend', {
        method: 'POST',
        body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'provider-message-1' } }),
        headers: {
          'svix-id': 'message-1',
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': 'v1,bm90YXNpZ25hdHVyZQ==',
        },
      })
    )
    expect(response.status).toBe(400)
  })

  it('ignores an event about a message this app did not send', async () => {
    const { POST } = await import('@/app/api/webhooks/resend/route')
    const response = await POST(
      signedRequest({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 'somebody-elses-message', to: ['nobody@example.com'], from: 'x@y.z', subject: 'Hello', created_at: new Date().toISOString() },
      })
    )
    expect(response.status).toBe(200)
    expect(await prisma.messageLog.count()).toBe(0)
  })
})

describe('the feedback form', () => {
  it('links a response to the merchant and the campaign', async () => {
    const merchant = await createMerchant()
    const campaign = await createCampaign()

    const { POST } = await import('@/app/api/feedback/route')
    const response = await POST(
      request('/api/feedback', {
        method: 'POST',
        body: {
          merchantName: 'Test Shop',
          email: merchant.email,
          campaignId: campaign.id,
          satisfaction: 5,
          easeOfUse: 4,
          usefulParts: ['Tracking payments'],
          easeCollecting: 'Yes, significantly',
          npsScore: 9,
          followUp: false,
        },
      })
    )

    expect(response.status).toBe(200)
    const stored = await prisma.feedbackResponse.findFirst()
    expect(stored?.merchantId).toBe(merchant.id)
    expect(stored?.campaignId).toBe(campaign.id)
    expect(stored?.merchantEmail).toBe(merchant.email)
    expect(stored?.status).toBe('new')
  })

  it('still accepts a response with no email address', async () => {
    const { POST } = await import('@/app/api/feedback/route')
    const response = await POST(
      request('/api/feedback', {
        method: 'POST',
        body: {
          merchantName: 'A Shop',
          satisfaction: 3,
          easeOfUse: 3,
          usefulParts: [],
          easeCollecting: 'No major difference',
          npsScore: 5,
          followUp: false,
        },
      })
    )

    expect(response.status).toBe(200)
    const stored = await prisma.feedbackResponse.findFirst()
    expect(stored?.merchantId).toBeNull()
    expect(stored?.campaignId).toBeNull()
  })

  it('rejects an email address that does not look like one', async () => {
    const { POST } = await import('@/app/api/feedback/route')
    const response = await POST(
      request('/api/feedback', {
        method: 'POST',
        body: {
          merchantName: 'A Shop',
          email: 'not-an-email',
          satisfaction: 3,
          easeOfUse: 3,
          usefulParts: [],
          easeCollecting: 'No major difference',
          npsScore: 5,
          followUp: false,
        },
      })
    )
    expect(response.status).toBe(400)
  })
})
