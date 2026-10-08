import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { PAY_SLUG, paymentPageUrl } from '@/lib/pay-url'

// A QR code for printing at a shop counter (U22). Scanned with a phone camera it
// opens the link's payment page, so every payment gets a record (a plain UPI QR
// would send money ToroPay can't match). It only ever encodes a payment page on
// this site, so it can't be used to make codes pointing anywhere else.
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get('slug') || ''
  if (!PAY_SLUG.test(slug)) {
    return NextResponse.json({ error: 'A valid payment link is required' }, { status: 400 })
  }

  const png = await QRCode.toBuffer(paymentPageUrl(slug), { width: 600, margin: 2, type: 'png' })

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // The image only depends on the link's address, so browsers and Vercel's CDN can keep it.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
    },
  })
}
