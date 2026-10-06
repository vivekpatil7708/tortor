// Used by middleware (Edge runtime): no Node imports.

/**
 * True when a browser says this request came from another website. Sign-in
 * actions refuse these, so another site can't log a visitor into someone
 * else's account (login CSRF). Requests that aren't from a browser carry
 * neither header and are allowed, since there's no visitor to trick.
 */
export function isCrossSiteRequest(headers: { get(name: string): string | null }, host: string | null): boolean {
  const fetchSite = headers.get('sec-fetch-site')
  if (fetchSite) return fetchSite === 'cross-site'
  const origin = headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}
