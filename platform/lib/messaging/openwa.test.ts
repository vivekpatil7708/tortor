import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenWaProvider, isOpenWaConfigured, openWaConfig, toChatId } from './openwa'

const fetchMock = vi.fn()

const SESSION_ID = '41a82fc5-5ee5-4eb6-8bc3-bbb902517fae'
const config = { url: 'http://localhost:2785', apiKey: 'owa_k1_test', sessionId: SESSION_ID }

const reply = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

const send = (over: Partial<Parameters<OpenWaProvider['sendMessage']>[0]> = {}) =>
  new OpenWaProvider(config).sendMessage({ to: '918830184550', body: 'Your order shipped', ...over })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('OPENWA_URL', '')
  vi.stubEnv('OPENWA_API_KEY', '')
  vi.stubEnv('OPENWA_SESSION_ID', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('reading OpenWA settings from the environment', () => {
  it('returns null unless all three settings are present', () => {
    expect(openWaConfig({})).toBeNull()
    expect(openWaConfig({ OPENWA_URL: 'http://x' })).toBeNull()
    expect(openWaConfig({ OPENWA_URL: 'http://x', OPENWA_API_KEY: 'k' })).toBeNull()
    expect(openWaConfig({ OPENWA_API_KEY: 'k', OPENWA_SESSION_ID: SESSION_ID })).toBeNull()
  })

  it('reads all three and strips a trailing slash from the URL', () => {
    expect(openWaConfig({
      OPENWA_URL: 'http://localhost:2785/',
      OPENWA_API_KEY: ' k ',
      OPENWA_SESSION_ID: SESSION_ID,
    })).toEqual({ url: 'http://localhost:2785', apiKey: 'k', sessionId: SESSION_ID })
  })

  it('reports whether the integration is configured', () => {
    expect(isOpenWaConfigured({})).toBe(false)
    expect(isOpenWaConfigured({
      OPENWA_URL: 'http://x', OPENWA_API_KEY: 'k', OPENWA_SESSION_ID: SESSION_ID,
    })).toBe(true)
  })
})

describe('turning a phone number into a WhatsApp chat id', () => {
  it('accepts the shapes an Indian order record produces', () => {
    // All of these are the same number.
    expect(toChatId('918830184550')).toBe('918830184550@c.us')
    expect(toChatId('+91 88301 84550')).toBe('918830184550@c.us')
    expect(toChatId('+91-88301-84550')).toBe('918830184550@c.us')
    expect(toChatId('0918830184550')).toBe('918830184550@c.us')
  })

  it('adds India\'s country code to a bare 10-digit mobile number', () => {
    // Without this the gateway accepts `8830184550@c.us` and the message never
    // arrives, which is the worst possible failure: silent.
    expect(toChatId('8830184550')).toBe('918830184550@c.us')
    expect(toChatId('+91 88301 84550')).toBe(toChatId('8830184550'))
  })

  it('drops a national trunk 0 before adding the country code', () => {
    expect(toChatId('08830184550')).toBe('918830184550@c.us')
    expect(toChatId('008830184550')).toBe('918830184550@c.us')
  })

  it('leaves a number that already has a country code alone', () => {
    // Not Indian, and not 10 digits, so no prefix is invented.
    expect(toChatId('+44 7700 900123')).toBe('447700900123@c.us')
    expect(toChatId('14155552671')).toBe('14155552671@c.us')
  })

  it('refuses anything that cannot be a phone number', () => {
    // A bogus chat id must fail here rather than being sent to the gateway,
    // which accepts some unmatchable ids without complaint.
    expect(toChatId('')).toBeNull()
    expect(toChatId(null)).toBeNull()
    expect(toChatId(undefined)).toBeNull()
    expect(toChatId('not a number')).toBeNull()
    expect(toChatId('12345')).toBeNull()
    expect(toChatId('12345678901234567890')).toBeNull()
  })
})

describe('sending a WhatsApp message through OpenWA', () => {
  it('posts to the send-text route with the session id, key and chat id', async () => {
    fetchMock.mockResolvedValue(reply(201, { messageId: 'true_918830184550@c.us_3EB0', timestamp: 1792622107 }))

    const result = await send()

    expect(result).toEqual({ providerMessageId: 'true_918830184550@c.us_3EB0', ok: true, status: 'sent' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`http://localhost:2785/api/sessions/${SESSION_ID}/messages/send-text`)
    expect(init.method).toBe('POST')
    expect(init.headers['X-API-Key']).toBe('owa_k1_test')
    expect(JSON.parse(init.body)).toEqual({ chatId: '918830184550@c.us', text: 'Your order shipped' })
  })

  it('uses the session UUID, never the display name', async () => {
    fetchMock.mockResolvedValue(reply(201, { messageId: 'm1' }))

    await new OpenWaProvider({ ...config, sessionId: 'toropay' }).sendMessage({ to: '918830184550', body: 'Hi' })

    // The gateway keeps the documented 400 for a name, but our URL must carry
    // whatever it was given verbatim so the operator sees their own mistake.
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:2785/api/sessions/toropay/messages/send-text')
  })

  it('treats the gateway\'s "session is not active" 400 as a failure, not a success', async () => {
    fetchMock.mockResolvedValue(reply(400, {
      message: "Session 'toropay' is not active. Start the session first.",
      error: 'Bad Request',
      statusCode: 400,
    }))

    const result = await send()

    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.providerMessageId).toBeNull()
    expect(result.error).toContain("Session 'toropay' is not active")
  })

  it('reports a failed send when the gateway is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const result = await send()

    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('fetch failed')
  })

  it('reports a failed send when the gateway does not answer in time', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      }))

    const result = await new OpenWaProvider(config, 20).sendMessage({ to: '918830184550', body: 'Hi' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('did not respond within 20ms')
  })

  it('marks a 429 as transient so a retry is safe', async () => {
    fetchMock.mockResolvedValue(reply(429, { message: 'Too many requests', code: 'RATE_LIMITED', retryAfterSeconds: 30 }))

    const result = await send()

    expect(result.ok).toBe(false)
    expect(result.error).toContain('RATE_LIMITED')
    expect(result.error).toContain('retry after 30s')
    expect(result.error).toContain('transient')
  })

  it('survives an error body that is not JSON', async () => {
    fetchMock.mockResolvedValue(reply(502, '<html>Bad Gateway</html>'))

    const result = await send()

    expect(result.ok).toBe(false)
    expect(result.error).toContain('502')
  })

  it('does not invent a message id when the gateway omits one', async () => {
    fetchMock.mockResolvedValue(reply(201, {}))

    const result = await send()

    expect(result.ok).toBe(true)
    expect(result.providerMessageId).toBeNull()
  })

  it('fails before calling the gateway for a number it cannot use', async () => {
    const result = await send({ to: '123' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('valid phone number')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails an empty body rather than sending a blank message', async () => {
    const result = await send({ body: '   ' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('empty')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('retrying a send without sending twice', () => {
  it('passes an idempotency key through when the caller supplies one', async () => {
    fetchMock.mockResolvedValue(reply(201, { messageId: 'm1' }))

    await send({ metadata: { idempotencyKey: 'order-TXN-1' } })

    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('order-TXN-1')
  })

  it('omits the header when there is no key', async () => {
    fetchMock.mockResolvedValue(reply(201, { messageId: 'm1' }))

    await send()

    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBeUndefined()
  })

  it('hashes a key containing characters OpenWA would reject', async () => {
    fetchMock.mockResolvedValue(reply(201, { messageId: 'm1' }))

    await send({ metadata: { idempotencyKey: 'order 1 : tést' } })

    const key = fetchMock.mock.calls[0][1].headers['Idempotency-Key']
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('configuration', () => {
  it('refuses to send when a setting is missing', async () => {
    for (const broken of [
      { ...config, url: '' },
      { ...config, apiKey: '' },
      { ...config, sessionId: '' },
    ]) {
      const result = await new OpenWaProvider(broken).sendMessage({ to: '918830184550', body: 'Hi' })
      expect(result.ok).toBe(false)
      expect(result.error).toContain('not configured')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('advertises no template or media support, since send-text is text only', () => {
    const provider = new OpenWaProvider(config)
    expect(provider.channel).toBe('whatsapp')
    expect(provider.name).toBe('openwa')
    expect(provider.supportsTemplates()).toBe(false)
    expect(provider.supportsMedia()).toBe(false)
  })

  it('never claims a webhook signature it cannot verify', () => {
    expect(new OpenWaProvider(config).verifyWebhookSignature()).toBe(false)
  })
})
