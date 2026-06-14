import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { buildUpiPayUrl } from '@/lib/upi'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vpa = searchParams.get('vpa')
  const amount = searchParams.get('amount')
  const txnId = searchParams.get('txn_id')
  const note = searchParams.get('note') || 'Payment'

  if (!vpa || !amount || !txnId) {
    return NextResponse.json({ error: 'vpa, amount, txn_id required' }, { status: 400 })
  }

  const upiUrl = buildUpiPayUrl(vpa, Number(amount), txnId, note)
  const png = await QRCode.toBuffer(upiUrl, { width: 400, margin: 2, type: 'png' })

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
