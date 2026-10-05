// Used in the browser too (checkout page), so no Node-only imports here.
// The webhook URL check lives in lib/safe-fetch.ts (server only).

export function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
