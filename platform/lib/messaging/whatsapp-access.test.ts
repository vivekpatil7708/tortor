import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isWhatsAppEnabledFor, whatsAppChannelDescription, whatsAppEnabledEmails } from './whatsapp-access'

// Who may send WhatsApp while it is still early-access. This is the single
// decision the badge and the send route both read, so the cases that matter are
// the ones where a wrong answer silently opens sending to everyone.
const env = (list?: string, admin?: string) => {
  vi.stubEnv('WHATSAPP_ENABLED_MERCHANTS', list ?? '')
  vi.stubEnv('ADMIN_EMAIL', admin ?? '')
}

beforeEach(() => env())
afterEach(() => vi.unstubAllEnvs())

describe('parsing the allowlist', () => {
  it('reads a comma-separated list, trimming and lower-casing each entry', () => {
    env('  Tester@Example.com , another@example.com  ,')

    expect(whatsAppEnabledEmails()).toEqual(new Set(['tester@example.com', 'another@example.com']))
  })

  it('is empty when unset, which is what an unconfigured deploy looks like', () => {
    env(undefined)

    expect(whatsAppEnabledEmails()).toEqual(new Set())
  })

  it('ignores blank entries from stray commas', () => {
    env(',, ,')

    expect(whatsAppEnabledEmails()).toEqual(new Set())
  })
})

describe('who is allowed to send', () => {
  it('allows an email on the list', () => {
    env('tester@example.com')

    expect(isWhatsAppEnabledFor('tester@example.com')).toBe(true)
  })

  it('matches regardless of case or surrounding space', () => {
    env('tester@example.com')

    expect(isWhatsAppEnabledFor('  TESTER@Example.COM ')).toBe(true)
  })

  it('refuses an email that is not on the list', () => {
    env('tester@example.com')

    expect(isWhatsAppEnabledFor('someone@example.com')).toBe(false)
  })

  it('allows the admin account without it being listed', () => {
    env('', 'owner@toropay.co.in')

    expect(isWhatsAppEnabledFor('owner@toropay.co.in')).toBe(true)
  })

  it('does not mistake a lookalike admin address for the admin', () => {
    env('', 'owner@toropay.co.in')

    expect(isWhatsAppEnabledFor('owner@toropay.co.in.evil.com')).toBe(false)
    expect(isWhatsAppEnabledFor('notowner@toropay.co.in')).toBe(false)
  })

  it('allows nobody but the admin when the list is unset', () => {
    // The important default: forgetting the env var in Vercel must not enable
    // WhatsApp for every merchant.
    env(undefined, 'owner@toropay.co.in')

    expect(isWhatsAppEnabledFor('any-merchant@example.com')).toBe(false)
    expect(isWhatsAppEnabledFor('owner@toropay.co.in')).toBe(true)
  })

  it('allows nobody at all when there is no list and no admin configured', () => {
    env(undefined, undefined)

    expect(isWhatsAppEnabledFor('any-merchant@example.com')).toBe(false)
  })

  it('refuses a missing or blank email rather than throwing', () => {
    env('tester@example.com')

    expect(isWhatsAppEnabledFor(null)).toBe(false)
    expect(isWhatsAppEnabledFor(undefined)).toBe(false)
    expect(isWhatsAppEnabledFor('')).toBe(false)
    expect(isWhatsAppEnabledFor('   ')).toBe(false)
  })
})

describe('the description shown beside the badge', () => {
  it('explains that sending is enabled', () => {
    expect(whatsAppChannelDescription(true, true)).toContain('enabled for your account')
  })

  it('keeps the coming-soon wording for a merchant who is not on the list', () => {
    expect(whatsAppChannelDescription(false, true)).toContain('Coming soon')
  })

  it('says the server is not set up when the gateway is missing, even for an allowed merchant', () => {
    // Otherwise an allowed merchant would be told sending is enabled and then
    // receive a 503, which reads as a bug rather than a rollout.
    const description = whatsAppChannelDescription(true, false)
    expect(description).toContain('not set up on this server')
    expect(description).not.toContain('enabled for your account')
  })
})
