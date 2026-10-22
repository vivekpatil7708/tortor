import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The payload that decides whether a merchant sees "Coming soon" or "Live" on
// the WhatsApp tab. The badge must match what the send route will actually do,
// so these tests pin the status alongside the configured/unconfigured gateway
// and allowlist combinations.
const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

const openwa = vi.hoisted(() => ({ isOpenWaConfigured: vi.fn() }))
vi.mock('@/lib/messaging/openwa', () => ({
  ...openwa,
  isOpenWaConfigured: openwa.isOpenWaConfigured,
}))

import { GET as channelStatus } from '@/app/api/integrations/channels/status/route'

/** The whatsapp channel from a fresh response. */
const whatsapp = async () => {
  const res = await channelStatus()
  return (await res.json()).channels.whatsapp as { status: string; description: string }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1', email: 'tester@example.com' })
  openwa.isOpenWaConfigured.mockReturnValue(true)
  vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', 'tester@example.com')
  vi.stubEnv('ADMIN_EMAIL', '')
})

afterEach(() => vi.unstubAllEnvs())

describe('the WhatsApp badge', () => {
  it('is Live for an allowlisted merchant when the gateway is configured', async () => {
    expect((await whatsapp()).status).toBe('available')
  })

  it('is Coming soon for a merchant who is not on the allowlist', async () => {
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', 'someone-else@example.com')

    const channel = await whatsapp()
    expect(channel.status).toBe('coming_soon')
    expect(channel.description).toContain('Coming soon')
  })

  it('is Coming soon when the allowlist is unset, not Live for everyone', async () => {
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', '')

    expect((await whatsapp()).status).toBe('coming_soon')
  })

  it('is Live for the admin account without it being listed', async () => {
    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', '')
    vi.stubEnv('ADMIN_EMAIL', 'tester@example.com')

    expect((await whatsapp()).status).toBe('available')
  })

  it('is not Live for an allowlisted merchant when the gateway is missing', async () => {
    // Otherwise the badge promises a channel that would answer 503 on send.
    openwa.isOpenWaConfigured.mockReturnValue(false)

    const channel = await whatsapp()
    expect(channel.status).toBe('coming_soon')
    expect(channel.description).toContain('not set up on this server')
  })

  it('reflects the env var changing between requests', async () => {
    // Env is read per request, so an operator adding a merchant to the list in
    // Vercel does not need a code change to take effect.
    expect((await whatsapp()).status).toBe('available')

    vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', 'other@example.com')
    expect((await whatsapp()).status).toBe('coming_soon')
  })
})

describe('the rest of the payload', () => {
  it('still reports email as available and instagram as coming soon', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')

    const res = await channelStatus()
    const channels = (await res.json()).channels

    expect(channels.email.status).toBe('available')
    expect(channels.instagram.status).toBe('coming_soon')
  })

  it('refuses without a signed-in merchant', async () => {
    auth.requireSession.mockRejectedValue(new Error('Unauthorized'))

    const res = await channelStatus()

    expect(res.status).toBe(401)
  })
})
