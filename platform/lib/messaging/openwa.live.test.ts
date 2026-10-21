import { describe, expect, it } from 'vitest'
import { OpenWaProvider } from './openwa'

// Live check against a real OpenWA instance. Opt-in: only runs when
// LIVE_OPENWA=1 and the three OPENWA_* vars are set, so CI and normal test
// runs are unaffected. Uses an intentionally unreachable recipient number so
// nothing is actually delivered.
const live = process.env.LIVE_OPENWA === '1'
  && Boolean(process.env.OPENWA_URL && process.env.OPENWA_API_KEY && process.env.OPENWA_SESSION_ID)

describe.skipIf(!live)('live OpenWA instance', () => {
  it('is reachable and accepts our credentials and payload shape', async () => {
    const provider = new OpenWaProvider({
      url: process.env.OPENWA_URL!,
      apiKey: process.env.OPENWA_API_KEY!,
      sessionId: process.env.OPENWA_SESSION_ID!,
    })

    // Sent to a number that is deliberately not on WhatsApp. A rejection past
    // auth and payload validation is the signal we want: it proves the URL, the
    // X-API-Key header, the { chatId, text } body and the session UUID are all
    // correct, and that we surface the gateway's own explanation.
    const result = await provider.sendMessage({ to: '999999999999', body: 'ToroPay connectivity probe' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('400')
    expect(result.error).toMatch(/recipient|resolve/)
    // Not an auth or routing error, which is what a wrong key or bad session
    // id would produce.
    expect(result.error).not.toMatch(/API key|Unauthorized|not active/)
  })

  it('rejects the session display name, proving the id is required', async () => {
    const provider = new OpenWaProvider({
      url: process.env.OPENWA_URL!,
      apiKey: process.env.OPENWA_API_KEY!,
      sessionId: 'toropay',
    })

    const result = await provider.sendMessage({ to: '918830184550', body: 'should not send' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('not active')
  })
})
