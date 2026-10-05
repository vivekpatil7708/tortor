import net from 'net'
import { isBlockedAddress } from './safe-fetch'

export function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Save-time check for webhook URLs: https, and not an obviously private
 * address or name. Delivery checks the resolved address again (lib/safe-fetch.ts).
 */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    if (net.isIP(host)) return !isBlockedAddress(host)
    // Single-label names and these suffixes only mean something inside a private network.
    if (!host.includes('.') || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return false
    return true
  } catch {
    return false
  }
}
