import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'
import { createOrder } from '@/lib/orders'
import { createFollowUpTask, suggestFollowUps, createFollowUpFromSuggestion, listFollowUpTasks } from '@/lib/follow-ups'

const TRUNCATE = 'follow_up_tasks, order_status_history, order_items, orders, products, customers, audit_logs'

describe('integration: follow-up tasks (Phase 4)', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
  })

  it('creates tasks, suggests follow-ups for stale pending orders, and dedupes suggestions', async () => {
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 1 }],
    })

    // Age the order past the 24h threshold with an unpaid payment state.
    await prisma.order.update({
      where: { id: order!.id },
      data: { orderStatus: 'pending_payment', paymentStatus: 'pending', createdAt: new Date(Date.now() - 48 * 3600_000) },
    })

    const task = await createFollowUpTask({ merchantId, customerId: customer.id, orderId: order!.id, category: 'general', title: 'Check in' })
    expect(task.status).toBe('open')

    const suggestions = await suggestFollowUps(merchantId)
    const pending = suggestions.find(s => s.category === 'payment_pending')
    expect(pending).toBeDefined()
    expect(pending!.orderId).toBe(order!.id)

    const first = await createFollowUpFromSuggestion(merchantId, pending!)
    expect(first.created).toBe(true)
    const createdTask = await prisma.followUpTask.findUnique({ where: { id: (first.task as { id: string }).id } })
    expect(createdTask!.category).toBe('payment_pending')

    const again = await createFollowUpFromSuggestion(merchantId, pending!)
    expect(again.created).toBe(false)

    const { tasks, total } = await listFollowUpTasks(merchantId, { status: 'open' })
    expect(total).toBeGreaterThanOrEqual(2)
    expect(tasks.some(t => t.category === 'payment_pending')).toBe(true)
  })
})