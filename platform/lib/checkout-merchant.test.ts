import { beforeEach, describe, expect, it, vi } from 'vitest'

// The public payment-link data endpoint (GET /api/pay/[slug]) loads only the
// merchant's branding and status, never the whole account record.
const db = vi.hoisted(() => ({
  paymentLink: { findFirst: vi.fn() },
  merchant: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { GET } from '@/app/api/pay/[slug]/route'
import { CHECKOUT_MERCHANT_FIELDS } from '@/lib/serializers'

const link = {
  id: 'link-1', merchantId: 'm1', upiId: 'shop@upi', title: 'Order', description: null, amount: 499,
  amountFlexible: false, minAmount: null, maxAmount: null, customFields: '[]', buttonText: 'Pay',
  redirectUrl: null, slug: 'u3MfoJlCOF', status: 'active', expiryAt: null,
}
const branding = {
  status: 'active', businessLogoUrl: null, bgImageUrl: null, brandColorPrimary: '#111111',
  brandColorSecondary: '#ffffff', buttonStyle: 'rounded', pageTheme: 'light',
}

beforeEach(() => {
  vi.clearAllMocks()
  db.paymentLink.findFirst.mockResolvedValue(link)
  db.merchant.findUnique.mockResolvedValue(branding)
})

describe('public payment pages', () => {
  it('load only branding fields and status, nothing sensitive', () => {
    expect(Object.keys(CHECKOUT_MERCHANT_FIELDS).sort()).toEqual(
      ['bgImageUrl', 'brandColorPrimary', 'brandColorSecondary', 'businessLogoUrl', 'buttonStyle', 'pageTheme', 'status']
    )
  })

  it('GET /api/pay/[slug] asks the database for just those fields', async () => {
    const res = await GET(new Request('http://localhost/api/pay/u3MfoJlCOF'), { params: { slug: 'u3MfoJlCOF' } })

    expect(res.status).toBe(200)
    expect(db.merchant.findUnique).toHaveBeenCalledWith({ where: { id: 'm1' }, select: CHECKOUT_MERCHANT_FIELDS })
    const body = await res.json()
    expect(Object.keys(body.merchant).sort()).toEqual(
      ['bg_image_url', 'brand_color_primary', 'brand_color_secondary', 'business_logo_url', 'button_style', 'page_theme']
    )
  })

  it('still hides links of suspended merchants', async () => {
    db.merchant.findUnique.mockResolvedValue({ ...branding, status: 'suspended' })
    const res = await GET(new Request('http://localhost/api/pay/u3MfoJlCOF'), { params: { slug: 'u3MfoJlCOF' } })
    expect(res.status).toBe(403)
  })
})
