import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Customer database UI (Phase 1): list with server-side search, create, edit,
// delete, and the addresses shown on the customer's page.
const db = vi.hoisted(() => ({
  customer: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  customerAddress: { count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }))
vi.mock('@/lib/auth', () => auth)

import { GET as listCustomers, POST as createCustomer } from '@/app/api/customers/route'
import { GET as getCustomer, PATCH as updateCustomer, DELETE as deleteCustomer } from '@/app/api/customers/[id]/route'
import { POST as addAddress, DELETE as deleteAddress } from '@/app/api/customers/[id]/addresses/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const customerRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'c1', merchantId: 'm1', fullName: 'Asha Rao', phone: '9876543210', email: 'asha@example.com',
  tags: ['vip'], notes: 'Prefers evening delivery', totalOrders: 3, totalSpent: 1500,
  lastOrderAt: new Date('2026-10-01T00:00:00Z'), marketingConsent: true,
  createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
  _count: { addresses: 1 },
  ...over,
})

const request = (body: unknown, method = 'POST') =>
  new NextRequest('http://localhost/api/customers', { method, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireSession.mockResolvedValue({ id: 'm1', emailVerifiedAt: new Date() })
  db.customer.count.mockResolvedValue(1)
})

afterEach(() => vi.restoreAllMocks())

describe('listing customers', () => {
  it('returns each customer with their spend and order count', async () => {
    db.customer.findMany.mockResolvedValue([customerRow()])

    const body = await (await listCustomers(new NextRequest('http://localhost/api/customers'))).json()
    expect(body.customers[0]).toEqual(expect.objectContaining({
      id: 'c1', full_name: 'Asha Rao', total_orders: 3, total_spent: 1500, address_count: 1,
    }))
    expect(body.total).toBe(1)
    expect(body.next_cursor).toBeNull()
  })

  it('offers a next page when there are more rows than asked for', async () => {
    db.customer.findMany.mockResolvedValue([customerRow({ id: 'c1' }), customerRow({ id: 'c2' })])
    db.customer.count.mockResolvedValue(2)

    const body = await (await listCustomers(new NextRequest('http://localhost/api/customers?limit=1'))).json()
    expect(body.customers).toHaveLength(1)
    // The extra row is the page marker, not shown to the caller.
    expect(body.next_cursor).toBe('c1')
  })

  it('searches name, phone and email together', async () => {
    db.customer.findMany.mockResolvedValue([])
    await listCustomers(new NextRequest('http://localhost/api/customers?q=asha'))

    const where = db.customer.findMany.mock.calls[0][0].where
    expect(where.merchantId).toBe('m1')
    expect(where.OR).toHaveLength(3)
  })

  it('caps the search length and the page size', async () => {
    db.customer.findMany.mockResolvedValue([])
    await listCustomers(new NextRequest(`http://localhost/api/customers?q=${'x'.repeat(200)}&limit=9999`))

    const arg = db.customer.findMany.mock.calls[0][0]
    expect(arg.take).toBe(201) // 200 max + 1 marker
    expect(arg.where.OR[0].fullName.contains.length).toBe(64)
  })
})

describe('creating a customer', () => {
  it('stores a valid customer', async () => {
    db.customer.create.mockResolvedValue(customerRow({ id: 'c9', tags: ['vip', 'repeat'] }))

    const res = await createCustomer(request({ full_name: 'Asha Rao', phone: '9876543210', tags: ['vip', 'repeat'] }))
    expect(res.status).toBe(201)
    expect(db.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ merchantId: 'm1', fullName: 'Asha Rao', tags: ['vip', 'repeat'] }),
    }))
  })

  it('needs a name', async () => {
    expect((await createCustomer(request({ full_name: '   ' }))).status).toBe(400)
    expect(db.customer.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed email and phone', async () => {
    expect((await createCustomer(request({ full_name: 'Asha', email: 'not-an-email' }))).status).toBe(400)
    expect((await createCustomer(request({ full_name: 'Asha', phone: 'abc' }))).status).toBe(400)
  })

  it('tidies tags: trims, removes blanks and duplicates', async () => {
    db.customer.create.mockResolvedValue(customerRow())
    await createCustomer(request({ full_name: 'Asha', tags: ['  vip ', '', 'vip', 'repeat'] }))

    expect(db.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tags: ['vip', 'repeat'] }),
    }))
  })

  it('requires a verified email', async () => {
    auth.requireSession.mockResolvedValue({ id: 'm1', emailVerifiedAt: null })
    expect((await createCustomer(request({ full_name: 'Asha' }))).status).toBe(403)
  })
})

describe('one customer', () => {
  it('returns their addresses and recent orders', async () => {
    db.customer.findFirst.mockResolvedValue({
      ...customerRow(),
      addresses: [{
        id: 'a1', label: 'Home', recipientName: 'Asha Rao', phone: '9876543210', line1: '12 MG Road',
        line2: null, city: 'Pune', state: 'Maharashtra', pincode: '411001', country: 'India', isDefault: true,
      }],
      orders: [{ id: 'o1', orderNumber: 'TP-1', totalAmount: 1000, paymentStatus: 'paid', createdAt: new Date('2026-10-01T00:00:00Z') }],
    })

    const body = await (await getCustomer(new NextRequest('http://localhost/x'), params('c1'))).json()
    expect(body.customer.full_name).toBe('Asha Rao')
    expect(body.addresses[0]).toEqual(expect.objectContaining({ id: 'a1', is_default: true }))
    // The Decimal is turned into a plain number for the page.
    expect(body.orders[0]).toEqual(expect.objectContaining({ amount: 1000, status: 'paid' }))
  })

  it('will not show another merchant\'s customer', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    expect((await getCustomer(new NextRequest('http://localhost/x'), params('other'))).status).toBe(404)
  })

  it('edits contact details and consent', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'c1' })
    db.customer.update.mockResolvedValue(customerRow({ marketingConsent: false }))

    const res = await updateCustomer(request({ phone: '9000000000', marketing_consent: false }, 'PATCH'), params('c1'))
    expect(res.status).toBe(200)
    expect(db.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' }, data: expect.objectContaining({ phone: '9000000000', marketingConsent: false }),
    }))
  })

  it('refuses an empty edit', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'c1' })
    expect((await updateCustomer(request({}, 'PATCH'), params('c1'))).status).toBe(400)
    expect(db.customer.update).not.toHaveBeenCalled()
  })

  it('deletes only your own customer', async () => {
    db.customer.deleteMany.mockResolvedValue({ count: 1 })
    expect((await deleteCustomer(new NextRequest('http://localhost/x', { method: 'DELETE' }), params('c1'))).status).toBe(200)

    db.customer.deleteMany.mockResolvedValue({ count: 0 })
    expect((await deleteCustomer(new NextRequest('http://localhost/x', { method: 'DELETE' }), params('other'))).status).toBe(404)
  })
})

describe('addresses', () => {
  const address = {
    recipient_name: 'Asha Rao', line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001',
  }

  it('makes the first address the default', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'c1' })
    db.customerAddress.count.mockResolvedValue(0)
    db.customerAddress.create.mockResolvedValue({
      id: 'a1', ...address, label: null, phone: null, line2: null, country: 'India', isDefault: true,
    })

    const res = await addAddress(request(address), params('c1'))
    expect(res.status).toBe(201)
    expect(db.customerAddress.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ customerId: 'c1', merchantId: 'm1', isDefault: true }),
    }))
  })

  it('clears the old default when a new one is chosen', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'c1' })
    db.customerAddress.count.mockResolvedValue(2)
    db.customerAddress.create.mockResolvedValue({
      id: 'a2', ...address, label: null, phone: null, line2: null, country: 'India', isDefault: true,
    })

    await addAddress(request({ ...address, is_default: true }), params('c1'))
    expect(db.customerAddress.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerId: 'c1', isDefault: true }),
    }))
  })

  it('requires the address fields and a six digit PIN', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'c1' })
    expect((await addAddress(request({ ...address, city: '' }), params('c1'))).status).toBe(400)
    expect((await addAddress(request({ ...address, pincode: '41' }), params('c1'))).status).toBe(400)
    expect(db.customerAddress.create).not.toHaveBeenCalled()
  })

  it('removes one of your addresses', async () => {
    db.customerAddress.deleteMany.mockResolvedValue({ count: 1 })
    const req = new NextRequest('http://localhost/x?addressId=a1', { method: 'DELETE' })
    expect((await deleteAddress(req, params('c1'))).status).toBe(200)
    expect(db.customerAddress.deleteMany).toHaveBeenCalledWith({ where: { id: 'a1', customerId: 'c1', merchantId: 'm1' } })
  })
})
