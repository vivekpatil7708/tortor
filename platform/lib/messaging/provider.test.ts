import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessagingProvider } from './provider'

// Which implementation actually sends a channel's messages. Getting this wrong
// is how a "sent" gets recorded for a message that never left, so the
// precedence is pinned here rather than left to the send route to discover.
const openwaEnv = (configured: boolean) => {
  vi.stubEnv('OPENWA_URL', configured ? 'http://localhost:2785' : '')
  vi.stubEnv('OPENWA_API_KEY', configured ? 'owa_k1_test' : '')
  vi.stubEnv('OPENWA_SESSION_ID', configured ? '41a82fc5-5ee5-4eb6-8bc3-bbb902517fae' : '')
}

const metaCredentials = { accessToken: 'meta-token', phoneNumberId: '123456' }

beforeEach(() => {
  openwaEnv(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('choosing the WhatsApp provider', () => {
  it('prefers a configured OpenWA gateway over Meta', () => {
    openwaEnv(true)

    const provider = getMessagingProvider('whatsapp', metaCredentials)

    expect(provider.name).toBe('openwa')
    expect(provider.channel).toBe('whatsapp')
  })

  it('uses OpenWA even when no Meta credentials are stored', () => {
    openwaEnv(true)

    expect(getMessagingProvider('whatsapp', null).name).toBe('openwa')
  })

  it('falls back to Meta when OpenWA is not configured', () => {
    openwaEnv(false)

    expect(getMessagingProvider('whatsapp', metaCredentials).name).toBe('whatsapp')
  })

  it('uses the mock only when the channel is configured nowhere', () => {
    openwaEnv(false)

    expect(getMessagingProvider('whatsapp', null).name).toBe('mock-messaging')
  })

  it('does not treat a half-configured OpenWA as configured', () => {
    // A URL without a key must not select OpenWA: it would fail every send at
    // request time, and the mock fallback is at least honest about being a mock.
    vi.stubEnv('OPENWA_URL', 'http://localhost:2785')
    vi.stubEnv('OPENWA_API_KEY', '')
    vi.stubEnv('OPENWA_SESSION_ID', '')

    expect(getMessagingProvider('whatsapp', null).name).toBe('mock-messaging')
  })
})

describe('the other channels are unaffected', () => {
  it('still resolves email to the email provider', () => {
    openwaEnv(true)

    expect(getMessagingProvider('email').name).not.toBe('openwa')
  })

  it('still rejects an unsupported channel', () => {
    expect(() => getMessagingProvider('telegram' as never)).toThrow(/Unsupported messaging channel/)
  })
})
