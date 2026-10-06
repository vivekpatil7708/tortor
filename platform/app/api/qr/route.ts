import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { buildUpiPayUrl, cleanPayeeName, isValidVpa } from '@/lib/upi'
import { MAX_LINK_AMOUNT as MAX_AMOUNT } from '@/lib/money'

// Public on purpose: payment pages show these QR codes to customers. So every
// input is checked, and the same QR image is served from Vercel's cache
// instead of being drawn again.
const TXN_ID = /^[A-Za-z0-9_-]{1,64}$/

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vpa = searchParams.get('vpa') || ''
  const amount = Number(searchParams.get('amount'))
  const txnId = searchParams.get('txn_id') || ''
  // Letters (with the vowel signs of Indian scripts, \p{M}), numbers, spaces and simple punctuation only, as UPI apps show it.
  const note = (searchParams.get('note') || 'Payment').replace(/[^\p{L}\p{M}\p{N} .,&'()/-]/gu, '').trim().slice(0, 80) || 'Payment'

  if (!isValidVpa(vpa)) {
    return NextResponse.json({ error: 'A valid UPI ID is required' }, { status: 400 })
  }
  // Rounded to paise when the UPI address is built, so pages may pass any amount.
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return NextResponse.json({ error: 'A valid amount is required' }, { status: 400 })
  }
  if (!TXN_ID.test(txnId)) {
    return NextResponse.json({ error: 'A valid txn_id is required' }, { status: 400 })
  }

  // The business name, so UPI apps can show who is being paid (cleaned like the note).
  const payeeName = cleanPayeeName(searchParams.get('pn'))

  const upiUrl = buildUpiPayUrl(vpa, amount, txnId, note, payeeName)
  const png = await QRCode.toBuffer(upiUrl, { width: 400, margin: 2, type: 'png' })

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // The image only depends on the address, so browsers and Vercel's CDN can keep it.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
    },
  })
}
