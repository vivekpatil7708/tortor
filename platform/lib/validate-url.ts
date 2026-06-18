export function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '[::1]', 'metadata.google.internal']
    if (blocked.includes(host)) return false
    if (host.startsWith('10.') || host.startsWith('172.16.') || host.startsWith('192.168.')) return false
    return true
  } catch {
    return false
  }
}
