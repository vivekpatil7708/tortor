/** Link addresses as generated (nanoid) or chosen through the API: URL-safe characters only. */
export const PAY_SLUG = /^[A-Za-z0-9._~-]{1,100}$/

/** The public payment-page address for a link, on ToroPay's own site. */
export function paymentPageUrl(slug: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.toropay.co.in').replace(/\/+$/, '')
  return `${base}/pay/${encodeURIComponent(slug)}`
}
