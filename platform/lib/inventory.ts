import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export type InventoryMode = 'manual' | 'on_payment' | 'on_shipment'

export interface InventorySettings {
  inventoryMode: InventoryMode
  restoreStockOnCancelled: boolean
  restoreStockOnReturn: boolean
  allowOverselling: boolean
}

const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  inventoryMode: 'manual',
  restoreStockOnCancelled: true,
  restoreStockOnReturn: true,
  allowOverselling: false,
}

export async function getInventorySettings(merchantId: string): Promise<InventorySettings> {
  const row = await prisma.merchantSettings.findUnique({ where: { merchantId } })
  if (!row) return { ...DEFAULT_INVENTORY_SETTINGS }
  const mode = row.inventoryMode === 'on_payment' || row.inventoryMode === 'on_shipment' ? row.inventoryMode : 'manual'
  return {
    inventoryMode: mode,
    restoreStockOnCancelled: row.restoreStockOnCancelled,
    restoreStockOnReturn: row.restoreStockOnReturn,
    allowOverselling: row.allowOverselling,
  }
}

export async function updateInventorySettings(
  merchantId: string,
  patch: Partial<InventorySettings>,
) {
  return prisma.merchantSettings.upsert({
    where: { merchantId },
    update: {
      inventoryMode: patch.inventoryMode ?? undefined,
      restoreStockOnCancelled: patch.restoreStockOnCancelled ?? undefined,
      restoreStockOnReturn: patch.restoreStockOnReturn ?? undefined,
      allowOverselling: patch.allowOverselling ?? undefined,
    },
    create: {
      merchantId,
      inventoryMode: patch.inventoryMode ?? DEFAULT_INVENTORY_SETTINGS.inventoryMode,
      restoreStockOnCancelled: patch.restoreStockOnCancelled ?? true,
      restoreStockOnReturn: patch.restoreStockOnReturn ?? true,
      allowOverselling: patch.allowOverselling ?? false,
    },
  })
}

export interface DeductionResult {
  applied: boolean
  errors: string[]
  changed: Array<{ productId: string; name: string; quantity: number }>
}

async function deductionsForOrder(order: {
  id: string
  merchantId: string
  orderItems: Array<{
    id: string
    quantityOrdered: number
    quantityCancelled: number
    product: { id: string; name: string; productType: string; stockQuantity: number | null } | null
  }>
}, settings: InventorySettings): Promise<DeductionResult> {
  const errors: string[] = []
  const changed: DeductionResult['changed'] = []

  for (const item of order.orderItems) {
    if (!item.product) continue
    if (item.product.productType !== 'physical') continue
    if (item.product.stockQuantity == null) continue

    const qty = Math.max(0, item.quantityOrdered - item.quantityCancelled)
    if (qty === 0) continue

    const next = item.product.stockQuantity - qty
    if (next < 0 && !settings.allowOverselling) {
      errors.push(`${item.product.name}: only ${item.product.stockQuantity} in stock, ${qty} needed`)
      continue
    }
    changed.push({ productId: item.product.id, name: item.product.name, quantity: qty })
  }

  if (errors.length) {
    return { applied: false, errors, changed: [] }
  }
  return { applied: true, errors: [], changed }
}

/** Record a deduction for an order (physical items only), non-negative protected. */
export async function applyInventoryDeductionForOrder(params: {
  merchantId: string
  orderId: string
  actorUserId?: string | null
}): Promise<DeductionResult> {
  const { merchantId, orderId, actorUserId = null } = params
  const settings = await getInventorySettings(merchantId)

  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId },
    include: { orderItems: { include: { product: true } } },
  })
  if (!order) throw new Error('Order not found')

  const deduction = await deductionsForOrder(order, settings)
  if (!deduction.applied) {
    await logAudit({
      merchantId,
      actorUserId,
      action: 'inventory_deduction_failed',
      entityType: 'order',
      entityId: orderId,
      metadata: { errors: deduction.errors },
    })
    return deduction
  }

  if (!deduction.changed.length) return deduction

  await prisma.$transaction(async tx => {
    for (const c of deduction.changed) {
      const product = await tx.product.findUnique({ where: { id: c.productId } })
      if (!product) continue
      await tx.product.update({
        where: { id: c.productId },
        data: { stockQuantity: Math.max(product.stockQuantity ?? 0) - c.quantity },
      })
      await tx.inventoryAdjustment.create({
        data: {
          merchantId,
          productId: c.productId,
          orderId,
          adjustmentType: 'deduction',
          quantityChange: -c.quantity,
          reason: `Deducted for order ${order.orderNumber}`,
        },
      })
    }
  })

  await logAudit({
    merchantId,
    actorUserId,
    action: 'inventory_deducted',
    entityType: 'order',
    entityId: orderId,
    metadata: { products: deduction.changed.length, quantity: deduction.changed.reduce((s, c) => s + c.quantity, 0) },
  })
  return deduction
}

/**
 * Deduct stock when a payment/fulfillment event fires IF the merchant chose
 * that inventory mode. Never throws under normal conditions — returns the
 * result so callers can surface it.
 */
export async function applyInventoryDeductionOnMode(params: {
  merchantId: string
  orderId: string
  mode: InventoryMode
  actorUserId?: string | null
}): Promise<DeductionResult> {
  const settings = await getInventorySettings(params.merchantId)
  if (settings.inventoryMode !== params.mode) {
    return { applied: false, errors: [], changed: [] }
  }
  return applyInventoryDeductionForOrder(params)
}

/**
 * Net deduction for a product within an order (deductions minus restorations).
 * Negative value means stock is still owed.
 */
export async function netDeductionForOrder(orderId: string, productId: string): Promise<number> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { orderId, productId },
    select: { adjustmentType: true, quantityChange: true },
  })
  return rows.reduce((sum, r) => sum + r.quantityChange, 0)
}

/**
 * Restore previously-deducted stock on a cancelled order. Gated by the
 * merchant setting `restoreStockOnCancelled`.
 */
export async function restoreStockForOrder(params: {
  merchantId: string
  orderId: string
  reason?: string | null
  actorUserId?: string | null
}) {
  const { merchantId, orderId, reason = 'Order cancelled', actorUserId = null } = params
  const settings = await getInventorySettings(merchantId)
  if (!settings.restoreStockOnCancelled) {
    return { restored: 0, skipped: true, reason: 'restore_stock_on_cancelled disabled' }
  }

  const order = await prisma.order.findFirst({ where: { id: orderId, merchantId } })
  if (!order) throw new Error('Order not found')

  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: { orderId, merchantId, adjustmentType: { in: ['deduction', 'restoration'] } },
    select: { productId: true, quantityChange: true },
  })

  const netByProduct = new Map<string, number>()
  for (const a of adjustments) {
    netByProduct.set(a.productId, (netByProduct.get(a.productId) ?? 0) + a.quantityChange)
  }

  let restored = 0
  for (const [productId, net] of Array.from(netByProduct.entries())) {
    if (net >= 0) continue
    const toRestore = -net
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product || product.stockQuantity == null) continue
    await prisma.product.update({
      where: { id: productId },
      data: { stockQuantity: product.stockQuantity + toRestore },
    })
    await prisma.inventoryAdjustment.create({
      data: {
        merchantId,
        productId,
        orderId,
        adjustmentType: 'restoration',
        quantityChange: toRestore,
        reason: reason ?? undefined,
      },
    })
    restored += toRestore
  }

  if (restored > 0) {
    await logAudit({
      merchantId,
      actorUserId,
      action: 'inventory_restored',
      entityType: 'order',
      entityId: orderId,
      metadata: { quantity: restored, reason },
    })
  }
  return { restored, skipped: restored === 0 }
}

/**
 * Restore stock for returned items. Gated by `restoreStockOnReturn`.
 * Credits back the returned quantity for a product, clamped to the net
 * deduction previously recorded for that order.
 */
export async function restoreStockForReturnItems(params: {
  merchantId: string
  returnId: string
  reason?: string | null
  actorUserId?: string | null
}) {
  const { merchantId, returnId, reason = 'Return received', actorUserId = null } = params
  const settings = await getInventorySettings(merchantId)
  if (!settings.restoreStockOnReturn) {
    return { restored: 0, skipped: true, reason: 'restore_stock_on_return disabled' }
  }

  const ret = await prisma.returnRequest.findFirst({
    where: { id: returnId, merchantId },
    include: { items: { include: { orderItem: { include: { product: true } } } } },
  })
  if (!ret) throw new Error('Return request not found')

  const productQtys = new Map<string, number>()
  for (const item of ret.items) {
    const product = item.orderItem?.product
    if (!product) continue
    if (product.productType !== 'physical' || product.stockQuantity == null) continue
    const net = await netDeductionForOrder(ret.orderId, product.id)
    const toRestore = Math.min(item.quantity, Math.max(0, -net))
    if (toRestore <= 0) continue
    productQtys.set(product.id, (productQtys.get(product.id) ?? 0) + toRestore)
  }

  let restored = 0
  for (const [productId, qty] of Array.from(productQtys.entries())) {
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product || product.stockQuantity == null) continue
    await prisma.product.update({
      where: { id: productId },
      data: { stockQuantity: product.stockQuantity + qty },
    })
    await prisma.inventoryAdjustment.create({
      data: {
        merchantId,
        productId,
        orderId: ret.orderId,
        returnId,
        adjustmentType: 'restoration',
        quantityChange: qty,
        reason: reason ?? undefined,
      },
    })
    restored += qty
  }

  if (restored > 0) {
    await logAudit({
      merchantId,
      actorUserId,
      action: 'inventory_restored',
      entityType: 'return_request',
      entityId: returnId,
      metadata: { quantity: restored, reason },
    })
  }
  return { restored, skipped: restored === 0 }
}

/** Manual adjustment (dashboard). Non-negative unless overselling is enabled. */
export async function manualAdjustStock(params: {
  merchantId: string
  productId: string
  quantityChange: number
  reason?: string
  actorUserId?: string | null
}) {
  const { merchantId, productId, actorUserId = null } = params
  const settings = await getInventorySettings(merchantId)
  const product = await prisma.product.findFirst({ where: { id: productId, merchantId } })
  if (!product) throw new Error('Product not found')
  if (product.productType !== 'physical') throw new Error('Only physical products track inventory')

  const quantityChange = Math.round(params.quantityChange)
  if (quantityChange === 0) return product

  const next = (product.stockQuantity ?? 0) + quantityChange
  if (next < 0 && !settings.allowOverselling) {
    throw new Error(`Insufficient stock: would go to ${next} (overselling disabled)`)
  }

  await prisma.$transaction(async tx => {
    await tx.product.update({ where: { id: productId }, data: { stockQuantity: Math.max(next, 0) } })
    await tx.inventoryAdjustment.create({
      data: {
        merchantId,
        productId,
        adjustmentType: 'manual',
        quantityChange,
        reason: params.reason ?? '',
      },
    })
  })

  await logAudit({
    merchantId,
    actorUserId,
    action: 'inventory_manual_adjustment',
    entityType: 'product',
    entityId: productId,
    metadata: { quantity_change: quantityChange, reason: params.reason },
  })
  return prisma.product.findUnique({ where: { id: productId } })
}

export async function getInventoryLevels(merchantId: string) {
  const products = await prisma.product.findMany({
    where: { merchantId, productType: 'physical' },
    select: {
      id: true,
      name: true,
      sku: true,
      imageUrl: true,
      status: true,
      stockQuantity: true,
      lowStockThreshold: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  })
  return products.map(p => ({
    ...p,
    isLowStock: p.stockQuantity != null && p.lowStockThreshold != null && p.stockQuantity <= p.lowStockThreshold,
  }))
}

export async function getInventoryAdjustments(
  merchantId: string,
  filters: { productId?: string | null; from?: Date | null; to?: Date | null; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(filters.limit ?? 50, 200)
  const where: Record<string, unknown> = { merchantId }
  if (filters.productId) where.productId = filters.productId
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  const [adjustments, total] = await prisma.$transaction([
    prisma.inventoryAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: filters.offset ?? 0,
      include: { product: { select: { id: true, name: true, sku: true } } },
    }),
    prisma.inventoryAdjustment.count({ where }),
  ])
  return { adjustments, total, limit }
}