import { describe, expect, it } from 'vitest'
import { payCheckoutMetadata, payStatusMetadata } from './pay-preview'

const BASE = 'https://www.toropay.co.in'

describe('pay page preview metadata', () => {
  it('gives the checkout and the status page different identities', () => {
    // This is the whole point. When both pages inherited the root layout's
    // openGraph.url they both claimed to be the homepage, so a chat app's
    // crawler treated them as one page and reused a single cached preview for
    // both - which is how one link showed a branded card and the other did not.
    const checkout = payCheckoutMetadata('AWEkbs6x3r')
    const status = payStatusMetadata('AWEkbs6x3r')

    expect(checkout.openGraph?.url).toBe(`${BASE}/pay/AWEkbs6x3r`)
    expect(status.openGraph?.url).toBe(`${BASE}/pay/AWEkbs6x3r/success`)
    expect(checkout.openGraph?.url).not.toBe(status.openGraph?.url)
  })

  it('never claims to be the homepage', () => {
    // The exact failure: og:url pointing at the site root for a payment page.
    for (const meta of [payCheckoutMetadata('s'), payStatusMetadata('s')]) {
      expect(meta.openGraph?.url).not.toBe(BASE)
      expect(meta.openGraph?.url).not.toBe(`${BASE}/`)
    }
  })

  it('keeps the transaction id out of the status page identity', () => {
    // `?txn=` names a real order. A preview is fetched by crawlers and shown in
    // a chat thread, so it must not be identifiable to one person's payment.
    const status = payStatusMetadata('AWEkbs6x3r')
    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('txn=')
    expect(serialized).not.toContain('TXN')
    expect(status.openGraph?.url).toBe(`${BASE}/pay/AWEkbs6x3r/success`)
  })

  it('carries no customer name, amount or order id in any field', () => {
    // A guard against someone later wiring real order data into these tags.
    const serialized = JSON.stringify([payCheckoutMetadata('slug'), payStatusMetadata('slug')])
    expect(serialized).not.toMatch(/customer/i)
    expect(serialized).not.toMatch(/amount/i)
    expect(serialized).not.toMatch(/TXN[A-Z0-9]/i)
  })

  it('keeps both pages out of search, like the rest of /pay', () => {
    for (const meta of [payCheckoutMetadata('s'), payStatusMetadata('s')]) {
      expect(meta.robots).toEqual({ index: false, follow: false })
    }
  })

  it('sets a canonical URL so the same page is not treated as two', () => {
    expect(payCheckoutMetadata('s').alternates?.canonical).toBe(`${BASE}/pay/s`)
    expect(payStatusMetadata('s').alternates?.canonical).toBe(`${BASE}/pay/s/success`)
  })

  it('titles and describes both pages the same, in ToroPay branding', () => {
    // Consistency is the goal: whichever link is shared, the card is ToroPay's.
    const checkout = payCheckoutMetadata('s')
    const status = payStatusMetadata('s')
    expect(checkout.openGraph?.title).toContain('ToroPay')
    expect(status.openGraph?.title).toContain('ToroPay')
    expect(checkout.openGraph?.title).toBe(status.openGraph?.title)
    expect(checkout.openGraph?.description).toBe(status.openGraph?.description)
    // Twitter mirrors the same wording, so the card is ToroPay's either way.
    // (`twitter.card` is not read here: the root layout already sets
    // summary_large_image and this helper does not override it.)
    expect(checkout.twitter?.title).toBe(checkout.openGraph?.title)
    expect(status.twitter?.title).toBe(status.openGraph?.title)
    expect(checkout.twitter?.description).toBe(status.twitter?.description)
  })

  it('escapes a slug so a crafted link cannot break out of the tag', () => {
    const meta = payCheckoutMetadata('a" onload="alert(1)')
    expect(meta.openGraph?.url).toBe(`${BASE}/pay/a%22%20onload%3D%22alert(1)`)
  })

  it('falls back to the site card image, which is public and needs no login', () => {
    // No og:image is set here on purpose: the root layout's file-based
    // opengraph-image is inherited, is served without auth, and is the same for
    // every customer. Asserting its absence documents that intent.
    for (const meta of [payCheckoutMetadata('s'), payStatusMetadata('s')]) {
      expect(meta.openGraph?.images).toBeUndefined()
    }
  })
})
