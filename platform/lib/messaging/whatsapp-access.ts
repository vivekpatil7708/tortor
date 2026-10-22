import { isAdminEmail } from '@/lib/admin-auth'

/**
 * Who may send WhatsApp messages.
 *
 * WhatsApp is being opened up to a small set of accounts first, so a bad send
 * affects a tester rather than every merchant's customers. The allowlist lives
 * in WHATSAPP_ENABLED_MERCHANTS (comma-separated emails) and is deliberately
 * the single source of truth: the channel-status API reads it to decide whether
 * to show the "Coming soon" badge, and the send route reads it to decide whether
 * to send. Both call in here so the badge can never say "Live" while a send
 * answers 501, or the reverse.
 *
 * The ADMIN_EMAIL account is always allowed, so the operator who enables the
 * feature is never locked out of testing it, and changing ADMIN_EMAIL does not
 * require also editing this list.
 */

/** Parse the allowlist. Exported for tests and for callers that want the raw set. */
export function whatsAppEnabledEmails(env: Partial<NodeJS.ProcessEnv> = process.env): Set<string> {
  const raw = env.WHATSAPP_ENABLED_MERCHANTS || ''
  return new Set(
    raw
      .split(',')
      .map(entry => entry.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Whether this email may use WhatsApp.
 *
 * An empty or unset allowlist means nobody but the admin account, which is the
 * safe default: a missing env var in Vercel must not silently enable sending
 * for every merchant.
 */
export function isWhatsAppEnabledFor(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  if (whatsAppEnabledEmails().has(normalized)) return true
  // Administrators can always test the channel.
  return isAdminEmail(normalized)
}

/**
 * Copy describing why WhatsApp is or is not usable, for the channel-status API.
 * Kept here beside the decision it explains so the two cannot drift.
 */
export function whatsAppChannelDescription(enabled: boolean, configured: boolean): string {
  if (!configured) {
    return 'WhatsApp is not set up on this server yet. Support has been notified.'
  }
  return enabled
    ? 'WhatsApp message sending is enabled for your account.'
    : 'Coming soon — WhatsApp message sending will be available soon. Till then you can preview, copy, or send the message manually.'
}
