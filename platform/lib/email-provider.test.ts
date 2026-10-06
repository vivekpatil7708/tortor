import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FROM, ResendEmailProvider, senderAddress } from './emails/provider'

const fetchMock = vi.fn()
const email = { to: 'owner@ashacrafts.in', subject: 'A customer says they have paid', html: '<p>Hi</p>' }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const sentFrom = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body).from
const send = () => new ResendEmailProvider().sendTransactionalEmail(email)

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('EMAIL_FROM', '')
  vi.stubEnv('RESEND_FROM', 'ToroPay <hello@toropay.co.in>')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('who ToroPay emails come from', () => {
  it('uses EMAIL_FROM if set, then RESEND_FROM (as sign-up and password emails do), then the default', () => {
    expect(senderAddress()).toBe('ToroPay <hello@toropay.co.in>')

    vi.stubEnv('EMAIL_FROM', 'Alerts <alerts@toropay.co.in>')
    expect(senderAddress()).toBe('Alerts <alerts@toropay.co.in>')

    vi.stubEnv('EMAIL_FROM', '')
    vi.stubEnv('RESEND_FROM', '')
    expect(senderAddress()).toBe(DEFAULT_FROM)
  })

  it('sends from the RESEND_FROM address, with a time limit', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: 'em_1' }))

    expect(await send()).toEqual({ providerMessageId: 'em_1', ok: true })
    expect(sentFrom(0)).toBe('ToroPay <hello@toropay.co.in>')
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('tries the default sender once if the email service refuses RESEND_FROM', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(403, { name: 'validation_error', message: 'The domain is not verified' }))
      .mockResolvedValueOnce(reply(200, { id: 'em_2' }))

    expect(await send()).toEqual({ providerMessageId: 'em_2', ok: true })
    expect(sentFrom(1)).toBe(DEFAULT_FROM)
  })

  it("doesn't retry when the default sender itself is refused, or for other errors", async () => {
    vi.stubEnv('RESEND_FROM', '')
    fetchMock.mockResolvedValue(reply(403, { name: 'validation_error' }))
    await send()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockClear()
    vi.stubEnv('RESEND_FROM', 'ToroPay <hello@toropay.co.in>')
    fetchMock.mockResolvedValue(reply(429, { name: 'rate_limit_exceeded' }))
    await send()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("says why a send failed, without the service's message (it can contain the address)", async () => {
    fetchMock.mockResolvedValue(reply(422, { name: 'validation_error', message: 'Invalid `to` field: owner@ashacrafts.in' }))

    const result = await send()

    expect(result).toEqual({ providerMessageId: null, ok: false, error: 'HTTP 422 validation_error' })
    expect(JSON.stringify(result)).not.toContain('owner@ashacrafts.in')
  })

  it('says so when no email key is set, without calling the service', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await send()).toEqual({ providerMessageId: null, ok: false, error: 'RESEND_API_KEY is not set' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
