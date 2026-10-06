import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { GET as qr } from '@/app/api/qr/route'
import { UPI_APPS } from './constants'
import { buildAppDeepLink, buildUpiIntentUrl, buildUpiPayUrl, cleanPayeeName } from './upi'

// UPI apps show the payee name (pn) on their confirmation screen, so customers
// can see which business they are paying (U4).
afterEach(() => {
  vi.restoreAllMocks()
})

const query = (url: string) => new URLSearchParams(url.slice(url.indexOf('?') + 1).split('#')[0])

describe('payee name in UPI payment requests', () => {
  it('is added to every kind of UPI link', () => {
    const links = [
      buildUpiPayUrl('shop@okaxis', 499, 'TXN1', 'Order', 'Asha Crafts'),
      buildUpiIntentUrl('shop@okaxis', 499, 'TXN1', 'Order', 'Asha Crafts'),
      ...UPI_APPS.map(app => buildAppDeepLink(app, 'shop@okaxis', 499, 'TXN1', 'Order', 'Asha Crafts')),
    ]
    for (const link of links) {
      const params = query(link)
      expect(params.get('pn')).toBe('Asha Crafts')
      expect(params.get('pa')).toBe('shop@okaxis')
      expect(params.get('am')).toBe('499.00')
      expect(params.get('tr')).toBe('TXN1')
    }
    expect(buildUpiPayUrl('shop@okaxis', 499, 'TXN1', 'Order', 'Asha Crafts')).toBe(
      'upi://pay?pa=shop%40okaxis&pn=Asha+Crafts&am=499.00&cu=INR&mode=01&tn=Order&tr=TXN1'
    )
  })

  it('is left out when the business has no name, as before', () => {
    expect(buildUpiPayUrl('shop@okaxis', 499, 'TXN1', 'Order')).toBe(
      'upi://pay?pa=shop%40okaxis&am=499.00&cu=INR&mode=01&tn=Order&tr=TXN1'
    )
    expect(query(buildUpiPayUrl('shop@okaxis', 499, 'TXN1', 'Order', '  <>  ')).has('pn')).toBe(false)
  })

  it('keeps only letters, numbers and simple punctuation, up to 50 characters', () => {
    expect(cleanPayeeName('Asha  Crafts <script>')).toBe('Asha Crafts script')
    expect(cleanPayeeName("Rao & Sons (Pune) Pvt. Ltd.")).toBe("Rao & Sons (Pune) Pvt. Ltd.")
    expect(cleanPayeeName('आशा क्राफ्ट्स')).toBe('आशा क्राफ्ट्स')
    expect(cleanPayeeName('ஆஷா கைவினை')).toBe('ஆஷா கைவினை')
    expect(cleanPayeeName('a&b=c?d#e')).toBe('a&bcde')
    expect(cleanPayeeName('x'.repeat(80))).toHaveLength(50)
    expect(cleanPayeeName(null)).toBe('')
  })

  it('is drawn into the QR code, cleaned the same way', async () => {
    const toBuffer = vi.spyOn(QRCode, 'toBuffer')
    const res = await qr(new NextRequest(
      `http://localhost/api/qr?vpa=shop@okaxis&amount=499&txn_id=TXN1&note=Order&pn=${encodeURIComponent('Asha Crafts <b>')}`
    ))
    expect(res.status).toBe(200)
    expect(query(String(toBuffer.mock.calls[0][0])).get('pn')).toBe('Asha Crafts b')

    await qr(new NextRequest('http://localhost/api/qr?vpa=shop@okaxis&amount=499&txn_id=TXN1&note=Order'))
    expect(query(String(toBuffer.mock.calls[1][0])).has('pn')).toBe(false)
  })
})

describe('payment note in the QR code', () => {
  it('keeps the vowel signs of Hindi link titles', async () => {
    const toBuffer = vi.spyOn(QRCode, 'toBuffer')
    const res = await qr(new NextRequest(
      `http://localhost/api/qr?vpa=shop@okaxis&amount=499&txn_id=TXN1&note=${encodeURIComponent('दिवाली उपहार <b>')}`
    ))
    expect(res.status).toBe(200)
    expect(query(String(toBuffer.mock.calls[0][0])).get('tn')).toBe('दिवाली उपहार b')
  })
})
