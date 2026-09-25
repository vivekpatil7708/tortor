import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'
import { createOrder } from '@/lib/orders'
import { updateInventorySettings, applyInventoryDeductionOnMode, restoreStockForOrder, manualAdjustStock, getInventoryLevels } from '@/lib/inventory'

const TRUNCATE = 'inventory_adjustments, order_status_history, order_items, orders, products, customers, audit_logs, merchant_settings'

describe('integration: inventory (Phase 4)', () => {
  let merchantId = ''

  beforeAll(async () => {
    merchantId = (await makeMerchant()).id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
  })

  async function makeOrderWithProduct(stock: number, qty: number, price = 100) {
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price, stockQuantity: stock })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: price, quantity: qty }],
    })
    return { order, product }
  }

  it('deducts stock on payment mode and restores it when the order is cancelled', async () => {
    await updateInventorySettings(merchantId, { inventoryMode: 'on_payment', restoreStockOnCancelled: true, allowOverselling: false })
    const { order, product } = await makeOrderWithProduct(10, 3)

    const result = await applyInventoryDeductionOnMode({ merchantId, orderId: order!.id, mode: 'on_payment' })
    expect(result.applied).toBe(true)
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.stockQuantity).toBe(7)

    // Switching the merchant to shipment-mode turns off payment-time deduction.
    await updateInventorySettings(merchantId, { inventoryMode: 'on_shipment' })
    const skipped = await applyInventoryDeductionOnMode({ merchantId, orderId: order!.id, mode: 'on_payment' })
    expect(skipped.applied).toBe(false)
    expect(skipped.changed).toHaveLength(0)

    // Cancelling the order restores the deducted stock.
    const restored = await restoreStockForOrder({ merchantId, orderId: order!.id })
    expect(restored.restored).toBe(3)
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.stockQuantity).toBe(10)

    const levels = await getInventoryLevels(merchantId)
    expect(levels[0].stockQuantity).toBe(10)
  })

  it('blocks deductions that would oversell and records manual adjustments', async () => {
    await updateInventorySettings(merchantId, { inventoryMode: 'on_payment', allowOverselling: false })
    const { order, product } = await makeOrderWithProduct(2, 5)

    const blocked = await applyInventoryDeductionOnMode({ merchantId, orderId: order!.id, mode: 'on_payment' })
    expect(blocked.applied).toBe(false)
    expect(blocked.errors.length).toBeGreaterThan(0)
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.stockQuantity).toBe(2)

    const adjusted = await manualAdjustStock({ merchantId, productId: product.id, quantityChange: -1, reason: 'damage' })
    expect(adjusted!.stockQuantity).toBe(1)

    const rows = await prisma.inventoryAdjustment.findMany({ where: { productId: product.id, adjustmentType: 'manual' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityChange).toBe(-1)
    expect(rows[0].reason).toBe('damage')

    await expect(manualAdjustStock({ merchantId, productId: product.id, quantityChange: -5 })).rejects.toThrow('Insufficient stock')
  })
})