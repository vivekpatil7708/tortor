import type { Metadata } from 'next'

const BASE_URL = 'https://www.toropay.co.in'

/**
 * The site's social card.
 *
 * Served as a static file from `public/og-card.png` rather than the generated
 * `app/opengraph-image` route. Next's `ImageResponse` hardcodes
 * `Cache-Control: public, max-age=0, must-revalidate` in production, and a
 * `headers()` rule in next.config.js cannot override a header the route has
 * already set - it only appends, leaving `max-age=0` to win. That meant every
 * fetch of the card, including a link-preview crawler's, waited on a fresh Edge
 * render (~500ms) and was told not to cache the result, which shows up as a
 * preview with text but no image.
 *
 * The same bytes the route produced, served statically, with no login and no
 * JavaScript. Identical for every visitor, so it carries nothing about an order.
 */
const CARD_IMAGE = `${BASE_URL}/og-card.png`
const CARD_IMAGE_ALT = 'ToroPay — pay by UPI'

/**
 * Metadata for the two customer-facing pages behind one payment link:
 * the checkout (`/pay/<slug>`) and the order status (`/pay/<slug>/success`).
 *
 * These pages inherit the root layout's metadata unless a route overrides it,
 * and the root layout's `openGraph.url` is the homepage. That is what made
 * WhatsApp show two different previews for one link: a crawler treats `og:url`
 * as the identity of a page, so when the checkout and the status page both
 * claimed to *be* `https://www.toropay.co.in`, they collided on a single cached
 * preview. Whichever it had fetched first was shown for both - one branded
 * card and one plain fallback, from the same tags.
 *
 * Every field here is the same for every customer, so nothing about the order
 * can leak into a preview. WhatsApp fetches these tags without signing in and
 * without running JavaScript, and `robots` also keeps the pages out of search.
 * The image is the absolute, publicly reachable site card that the root layout
 * already generates; it is not customer-specific.
 */
function payPageMetadata(path: string): Metadata {
  const url = `${BASE_URL}${path}`
  const title = 'ToroPay — UPI Payment'
  const description =
    'Pay to this business over UPI through ToroPay. Payments go directly to the seller’s own UPI ID, and ToroPay never holds your money.'
  return {
    // Keeps transactional pages out of search, matching app/pay/layout.tsx.
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: {
      // The page's own URL, never the homepage, so a crawler can tell the
      // checkout and the status page apart instead of sharing one cache entry.
      url,
      title,
      description,
      siteName: 'ToroPay',
      type: 'website',
      locale: 'en_IN',
      images: [{ url: CARD_IMAGE, width: 1200, height: 630, alt: CARD_IMAGE_ALT, type: 'image/png' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: CARD_IMAGE, alt: CARD_IMAGE_ALT }],
    },
  }
}

/** The checkout page: where a customer pays an outstanding link. */
export function payCheckoutMetadata(slug: string): Metadata {
  return payPageMetadata(`/pay/${encodeURIComponent(slug)}`)
}

/**
 * The order status page: where a customer checks a payment already made.
 *
 * The `txn` query parameter is deliberately left out of the canonical URL and
 * the preview. It identifies a real order, and a preview is fetched by
 * crawlers and shown in chat threads, so it must carry nothing that ties the
 * card to one person's payment.
 */
export function payStatusMetadata(slug: string): Metadata {
  return payPageMetadata(`/pay/${encodeURIComponent(slug)}/success`)
}
