import { beforeEach, describe, expect, it, vi } from 'vitest'

// Website checkout: matching shoppers to saved customers, and what the public
// checkout page shows. The database is replaced by fakes.
const db = vi.hoisted(() => ({
  payment: { findUnique: vi.fn() },
  customer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  order: { update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { getCheckoutView, updateCheckoutCustomer } from '@/lib/checkout'

const ORDER_CREATED = new Date('2026-10-06T10:00:00Z')
const dec = (n: number) => ({ toNumber: () => n })

function paymentRow(customer: Record<string, unknown> | null) {
  return {
    id: 'pay1', merchantId: 'm1', checkoutSessionId: 'cs_1', paymentReference: 'ref', status: 'pending',
    amount: dec(499), currency: 'INR', provider: 'upi', mode: 'live', expiresAt: null, paidAt: null, paymentMethod: null,
    order: {
      id: 'o1', orderNumber: 'TP-1', customerId: (customer?.id as string) ?? null, customer, createdAt: ORDER_CREATED,
      subtotalAmount: dec(499), discountAmount: dec(0), shippingAmount: dec(0), taxAmount: dec(0), totalAmount: dec(499),
      currency: 'INR', orderItems: [],
    },
    merchant: {
      id: 'm1', businessName: 'Shop', businessLogoUrl: null, bgImageUrl: null, brandColorPrimary: '#000000',
      brandColorSecondary: '#ffffff', brandFont: 'Inter', buttonStyle: 'rounded', pageTheme: 'light',
      supportEmail: null, supportPhone: null, upiIds: [{ vpa: 'shop@upi', status: 'active', isPrimary: true }],
    },
  }
}

const savedCustomer = {
  id: 'c1', fullName: 'Asha Patil', email: 'asha@example.com', phone: '9876543210',
  createdAt: new Date('2026-09-01T10:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  db.customer.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data, createdAt: ORDER_CREATED }))
})

describe('updateCheckoutCustomer', () => {
  it("typing only someone's email never links to or reveals their saved record", async () => {
    db.payment.findUnique.mockResolvedValue(paymentRow(null))

    await updateCheckoutCustomer({ checkoutSessionId: 'cs_1', name: 'Mallory', email: 'asha@example.com', phone: null })

    expect(db.customer.findFirst).not.toHaveBeenCalled()
    expect(db.customer.create).toHaveBeenCalledWith({
      data: { merchantId: 'm1', fullName: 'Mallory', email: 'asha@example.com', phone: null },
    })
  })

  it('reuses a saved customer only when email and phone both match, without showing saved details', async () => {
    db.payment.findUnique.mockResolvedValueOnce(paymentRow(null)).mockResolvedValueOnce(paymentRow(savedCustomer))
    db.customer.findFirst.mockResolvedValue(savedCustomer)

    const view = await updateCheckoutCustomer({ checkoutSessionId: 'cs_1', name: 'Someone', email: 'asha@example.com', phone: '9876543210' })

    expect(db.customer.findFirst).toHaveBeenCalledWith({ where: { merchantId: 'm1', email: 'asha@example.com', phone: '9876543210' } })
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { customerId: 'c1' } })
    expect(db.customer.create).not.toHaveBeenCalled()
    expect(view?.order.customer_name).toBeNull()
    expect(JSON.stringify(view)).not.toContain('Asha Patil')
  })
})

describe('getCheckoutView', () => {
  it('shows contact details that were entered for this order', async () => {
    db.payment.findUnique.mockResolvedValue(paymentRow({ ...savedCustomer, createdAt: ORDER_CREATED }))
    const view = await getCheckoutView('cs_1')
    expect(view?.order.customer_name).toBe('Asha Patil')
    expect(view?.order.customer_phone).toBe('9876543210')
  })

  it('hides contact details saved before this order', async () => {
    db.payment.findUnique.mockResolvedValue(paymentRow(savedCustomer))
    const view = await getCheckoutView('cs_1')
    expect(view?.order).toMatchObject({ customer_name: null, customer_email: null, customer_phone: null })
  })

  it("loads only the merchant fields the page shows, never the whole account record", async () => {
    db.payment.findUnique.mockResolvedValue(paymentRow(null))
    await getCheckoutView('cs_1')

    const { include } = db.payment.findUnique.mock.calls[0][0]
    expect(include.merchant).not.toHaveProperty('include')
    expect(Object.keys(include.merchant.select)).not.toContain('passwordHash')
    expect(Object.keys(include.merchant.select)).not.toContain('resetToken')
  })
})
