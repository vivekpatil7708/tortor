import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { makeMerchant, makeCustomer, makeProduct } from './helpers'

const TRUNCATE = [
  'courier_webhook_events',
  'courier_connections',
  'shipment_events',
  'packages',
  'fulfillment_items',
  'fulfillments',
  'order_status_history',
  'order_items',
  'orders',
  'products',
  'customer_addresses',
  'customers',
  'audit_logs',
  'email_logs',
  'email_templates',
  'webhook_events',
  'webhook_endpoints',
  'webhook_delivery_logs',
].join(', ')

async function makeShippedPackage(merchantId: string, overrides: { qty?: number; email?: string } = {}) {
  const { qty = 1, email } = overrides
  const { createOrder } = await import('@/lib/orders')
  const customer = await makeCustomer(merchantId, email ? { email } : {})
  const product = await makeProduct(merchantId, { price: 100 })
  const order = await createOrder({
    merchantId,
    customerId: customer.id,
    items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: qty }],
  })
  const { createProviderShipment } = await import('@/lib/couriers/shipments')
  const result = await createProviderShipment({
    merchantId,
    orderId: order!.id,
    items: [{ orderItemId: order!.orderItems[0].id, quantity: qty }],
    courierProvider: 'mock',
  })
  return { order: order!, customer, package: result.package }
}

async function pushWebhook(merchantId: string, pkg: { awbNumber: string | null }, event: {
  eventType: string
  label: string
  status: string
  location?: string | null
}) {
  const { getCourierProvider } = await import('@/lib/couriers/index')
  const { getCourierWebhookSecret } = await import('@/lib/couriers/connections')
  const { processCourierWebhook } = await import('@/lib/couriers/webhook')
  const { signCourierWebhook } = await import('@/lib/couriers/signatures')
  const { MockCourierProvider } = await import('@/lib/couriers/mock')
  const mock = getCourierProvider('mock') as InstanceType<typeof MockCourierProvider>
  const pushed = mock.pushEvent(merchantId, { awbNumber: pkg.awbNumber }, event)
  if (!pushed) throw new Error('pushEvent could not find the shipment')
  const rawBody = JSON.stringify(pushed.webhookPayload)
  const secret = await getCourierWebhookSecret(merchantId, 'mock')
  const signature = signCourierWebhook(rawBody, secret as string)
  return processCourierWebhook({ provider: 'mock', rawBody, signature })
}

describe('integration: courier shipments (Phase 3)', () => {
  let merchantId = ''

  beforeAll(async () => {
    const merchant = await makeMerchant()
    merchantId = merchant.id
  })

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATE} RESTART IDENTITY CASCADE`)
    const { saveCourierConnection } = await import('@/lib/couriers/connections')
    await saveCourierConnection({ merchantId, provider: 'mock', testMode: true, credentials: { accountName: 'Test Store' } })
  })

  it('creates a provider shipment, labels it and is idempotent on request id', async () => {
    const { createProviderShipment } = await import('@/lib/couriers/shipments')
    const { generateLabelForPackage } = await import('@/lib/couriers/shipments')
    const { createOrder } = await import('@/lib/orders')
    const customer = await makeCustomer(merchantId, { email: 'buyer@test.dev' })
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 2 }],
    })

    const first = await createProviderShipment({
      merchantId,
      orderId: order!.id,
      requestId: 'req_abc123',
      items: [{ orderItemId: order!.orderItems[0].id, quantity: 2 }],
      courierProvider: 'mock',
    })

    expect(first.idempotent).toBe(false)
    expect(first.package.provider).toBe('mock')
    expect(first.package.awbNumber).toMatch(/^MOCK/)
    expect(first.package.labelUrl).toBeTruthy()

    // Idempotency: same request id returns the SAME package, no new fulfillment.
    const retry = await createProviderShipment({
      merchantId,
      orderId: order!.id,
      requestId: 'req_abc123',
      items: [{ orderItemId: order!.orderItems[0].id, quantity: 999 }], // quantity ignored on replay
      courierProvider: 'mock',
    })
    expect(retry.idempotent).toBe(true)
    expect(retry.package.id).toBe(first.package.id)

    const fulfillments = await prisma.fulfillment.count({ where: { orderId: order!.id } })
    expect(fulfillments).toBe(1)

    // Label generation persists a label url.
    const label = await generateLabelForPackage({ merchantId, packageId: first.package.id })
    expect(label.labelUrl).toMatch(/\.pdf$/)
    const persisted = await prisma.package.findUnique({ where: { id: first.package.id } })
    expect(persisted!.labelUrl).toBe(label.labelUrl)

    // The customer got a shipment-created email.
    const emails = await prisma.emailLog.findMany({ where: { merchantId, templateKey: 'shipment_created' } })
    expect(emails.length).toBe(1)
  })

  it('supports multiple shipments per order without double fulfillment', async () => {
    const { createProviderShipment } = await import('@/lib/couriers/shipments')
    const { createOrder } = await import('@/lib/orders')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 3 }],
    })

    const a = await createProviderShipment({
      merchantId,
      orderId: order!.id,
      requestId: 'req_multi_1',
      items: [{ orderItemId: order!.orderItems[0].id, quantity: 1 }],
      courierProvider: 'mock',
    })
    const b = await createProviderShipment({
      merchantId,
      orderId: order!.id,
      requestId: 'req_multi_2',
      items: [{ orderItemId: order!.orderItems[0].id, quantity: 2 }],
      courierProvider: 'mock',
    })

    expect(a.package.id).not.toBe(b.package.id)
    expect(a.package.fulfillmentId).not.toBe(b.package.fulfillmentId)
    const count = await prisma.fulfillment.count({ where: { orderId: order!.id } })
    expect(count).toBe(2)
  })

  it('applies courier webhook tracking updates and mirrors the fulfillment', async () => {
    const made = await makeShippedPackage(merchantId)
    const res = await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.in_transit',
      label: 'Package in transit via Mumbai hub',
      status: 'in_transit',
      location: 'Mumbai',
    })

    expect(res.applied).toBe(true)
    expect(res.changed).toBe(true)

    const pkg = await prisma.package.findUnique({ where: { id: made.package.id }, include: { events: true, fulfillment: true } })
    expect(pkg!.packageStatus).toBe('in_transit')
    expect(pkg!.fulfillment.status).toBe('in_transit')
    const courierEvent = pkg!.events.find(e => e.source === 'courier' && e.eventLabel === 'Package in transit via Mumbai hub')
    expect(courierEvent).toBeTruthy()
    expect(courierEvent!.eventLabel).toBe('Package in transit via Mumbai hub')

    const history = await prisma.orderStatusHistory.findMany({ where: { packageId: made.package.id, statusType: 'shipment' } })
    expect(history.some(h => h.newStatus === 'in_transit' && h.changedByType === 'system')).toBe(true)
  })

  it('deduplicates repeated webhook payloads', async () => {
    const made = await makeShippedPackage(merchantId)
    const { getCourierProvider } = await import('@/lib/couriers/index')
    const { MockCourierProvider } = await import('@/lib/couriers/mock')
    const mock = getCourierProvider('mock') as InstanceType<typeof MockCourierProvider>
    const pushed = mock.pushEvent(merchantId, { awbNumber: made.package.awbNumber }, {
      eventType: 'shipment.out_for_delivery',
      label: 'Out for delivery',
      status: 'out_for_delivery',
      location: 'New Delhi',
    })
    if (!pushed) throw new Error('push failed')
    const { signCourierWebhook } = await import('@/lib/couriers/signatures')
    const { getCourierWebhookSecret } = await import('@/lib/couriers/connections')
    const { processCourierWebhook } = await import('@/lib/couriers/webhook')
    const rawBody = JSON.stringify(pushed.webhookPayload)
    const secret = await getCourierWebhookSecret(merchantId, 'mock')
    const signature = signCourierWebhook(rawBody, secret as string)

    const first = await processCourierWebhook({ provider: 'mock', rawBody, signature })
    expect(first.applied).toBe(true)

    const replay = await processCourierWebhook({ provider: 'mock', rawBody, signature })
    expect(replay.duplicate).toBe(true)
    expect(replay.applied).toBe(false)

    const rows = await prisma.courierWebhookEvent.findMany({ where: { merchantId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].processingStatus).toBe('duplicate')
  })

  it('rejects events signed with a wrong secret', async () => {
    const made = await makeShippedPackage(merchantId)
    const { getCourierProvider } = await import('@/lib/couriers/index')
    const { processCourierWebhook } = await import('@/lib/couriers/webhook')
    const { signCourierWebhook } = await import('@/lib/couriers/signatures')
    const { MockCourierProvider } = await import('@/lib/couriers/mock')
    const mock = getCourierProvider('mock') as InstanceType<typeof MockCourierProvider>
    const pushed = mock.pushEvent(merchantId, { awbNumber: made.package.awbNumber }, {
      eventType: 'shipment.in_transit',
      label: 'Wrong secret',
      status: 'in_transit',
    })
    if (!pushed) throw new Error('push failed')
    const rawBody = JSON.stringify(pushed.webhookPayload)
    const bad = signCourierWebhook(rawBody, 'hunter2_wrong')

    const res = await processCourierWebhook({ provider: 'mock', rawBody, signature: bad })
    expect(res.signatureValid).toBe(false)
    expect(res.applied).toBe(false)

    const pkg = await prisma.package.findUnique({ where: { id: made.package.id } })
    expect(pkg!.packageStatus).toBe('shipped')

    const events = await prisma.courierWebhookEvent.findMany({ where: { merchantId } })
    expect(events[0].processingStatus).toBe('bad_signature')
  })

  it('treats delivered and returned as terminal and rejects downgrades as out-of-order', async () => {
    const made = await makeShippedPackage(merchantId)

    const delivered = await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.delivered',
      label: 'Delivered at doorstep',
      status: 'delivered',
      location: 'Delhi Gate',
    })
    expect(delivered.changed).toBe(true)
    expect(delivered.applied).toBe(true)

    // Out-of-order downgrade after terminal state.
    const downgrade = await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.in_transit',
      label: 'Late in-transit event',
      status: 'in_transit',
    })
    expect(downgrade.outOfOrder).toBe(true)
    expect(downgrade.applied).toBe(false)

    const pkg = await prisma.package.findUnique({ where: { id: made.package.id } })
    expect(pkg!.packageStatus).toBe('delivered')
    expect(pkg!.deliveredAt).toBeTruthy()

    const flagged = await prisma.courierWebhookEvent.findFirst({ where: { merchantId, processingStatus: 'out_of_order' } })
    expect(flagged).toBeTruthy()
    expect(flagged!.processingError).toMatch(/Out-of-order/)

    // A repeated delivered event is accepted but a no-change.
    const repeat = await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.delivered',
      label: 'Delivered (confirmation)',
      status: 'delivered',
    })
    expect(repeat.applied).toBe(true)
    expect(repeat.changed).toBe(false)
  })

  it('records an RTO from a webhook and sets rto timestamps', async () => {
    const made = await makeShippedPackage(merchantId)
    const res = await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.rto_initiated',
      label: 'RTO requested',
      status: 'returned',
      location: 'Bengaluru',
    })

    expect(res.changed).toBe(true)

    const pkg = await prisma.package.findUnique({ where: { id: made.package.id }, include: { fulfillment: true } })
    expect(pkg!.packageStatus).toBe('returned')
    expect(pkg!.rtoInitiatedAt).toBeTruthy()
    expect(pkg!.fulfillment.status).toBe('returned')

    const order = await prisma.order.findUnique({ where: { id: made.order.id } })
    expect(order!.fulfillmentSummaryStatus).toBe('attention_required')
  })

  it('initiates an RTO locally with a return tracking number', async () => {
    const made = await makeShippedPackage(merchantId)
    const { initiateReturnForPackage } = await import('@/lib/couriers/shipments')
    const res = await initiateReturnForPackage({ merchantId, packageId: made.package.id, reason: 'Wrong address' })

    expect(res.returnTrackingNumber).toMatch(/^RMOCK/)
    const pkg = await prisma.package.findUnique({ where: { id: made.package.id } })
    expect(pkg!.packageStatus).toBe('returned')
    expect(pkg!.returnTrackingNumber).toBe(res.returnTrackingNumber)
    const events = await prisma.shipmentEvent.findMany({ where: { packageId: made.package.id, eventLabel: { contains: 'RTO initiated' } } })
    expect(events.length).toBe(1)
  })

  it('schedules a pickup and cancels a shipment', async () => {
    const made = await makeShippedPackage(merchantId)
    const { schedulePickupForPackage, cancelProviderPackage } = await import('@/lib/couriers/shipments')

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const pickup = await schedulePickupForPackage({ merchantId, packageId: made.package.id, pickupDate: tomorrow })
    expect(pickup.pickupScheduledAt).toBeTruthy()

    const pkgAfter = await prisma.package.findUnique({ where: { id: made.package.id } })
    expect(pkgAfter!.pickupScheduledAt?.toDateString()).toBe(tomorrow.toDateString())

    const cancelled = await cancelProviderPackage({ merchantId, packageId: made.package.id })
    expect(cancelled.ok).toBe(true)
    expect(cancelled.skipped).toBe(false)

    const pkg = await prisma.package.findUnique({ where: { id: made.package.id } })
    expect(pkg!.packageStatus).toBe('cancelled')
  })

  it('syncs a package from the provider and skips untracked packages', async () => {
    const made = await makeShippedPackage(merchantId)
    const { syncPackageFromProvider } = await import('@/lib/couriers/shipments')

    // Mock packages are not synced against a live provider.
    const skipped = await syncPackageFromProvider({ merchantId, packageId: made.package.id })
    expect('skipped' in skipped).toBe(true)
    if ('skipped' in skipped) expect(skipped.reason).toMatch(/live provider/)
  })

  it('syncActiveShipments only scans live provider packages and surfaces errors gracefully', async () => {
    const made = await makeShippedPackage(merchantId)

    // Attribute a live provider without a connection -> sync surfaces an error.
    await prisma.package.update({
      where: { id: made.package.id },
      data: { provider: 'shiprocket', providerShipmentId: 'sr_1', lastProviderSyncAt: null },
    })

    const { syncActiveShipments } = await import('@/lib/couriers/sync')
    const result = await syncActiveShipments({ merchantId, limit: 50 })

    expect(result.scanned).toBeGreaterThanOrEqual(1)
    expect(result.errors).toBeGreaterThanOrEqual(1)
    // Mock packages (provider 'mock') are excluded from the scan.
    const mockPkgs = result.details.filter(d => d.error && /shiprocket/i.test(d.error))
    expect(mockPkgs.length).toBeGreaterThanOrEqual(1)
  })

  it('sends exactly one email per delivery milestone (dedupe)', async () => {
    const made = await makeShippedPackage(merchantId, { email: 'tracked@test.dev' })

    // shipment_created was already sent on creation — then in_transit.
    await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.in_transit',
      label: 'In transit',
      status: 'in_transit',
      location: 'Nagpur',
    })
    await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.out_for_delivery',
      label: 'Out for delivery',
      status: 'out_for_delivery',
      location: 'Nagpur',
    })

    const createdEmails = await prisma.emailLog.count({ where: { templateKey: 'shipment_created' } })
    const transitEmails = await prisma.emailLog.count({ where: { templateKey: 'shipment_in_transit' } })
    expect(createdEmails).toBe(1)
    expect(transitEmails).toBe(1)

    // A later unrelated in-transit event must NOT send another email.
    await pushWebhook(merchantId, made.package as { awbNumber: string | null }, {
      eventType: 'shipment.in_transit',
      label: 'In transit again',
      status: 'in_transit',
      location: 'Nagpur',
    })
    expect(await prisma.emailLog.count({ where: { templateKey: 'shipment_in_transit' } })).toBe(1)
  })

  it('partial delivery drives the order summary status', async () => {
    const { createProviderShipment } = await import('@/lib/couriers/shipments')
    const { applyCourierTrackingUpdate } = await import('@/lib/couriers/apply-tracking')
    const { createOrder } = await import('@/lib/orders')
    const customer = await makeCustomer(merchantId)
    const product = await makeProduct(merchantId, { price: 100 })
    const order = await createOrder({
      merchantId,
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, unitPrice: 100, quantity: 4 }],
    })

    const a = await createProviderShipment({
      merchantId, orderId: order!.id, requestId: 'req_part_1',
      items: [{ orderItemId: order!.orderItems[0].id, quantity: 2 }], courierProvider: 'mock',
    })
    const b = await createProviderShipment({
      merchantId, orderId: order!.id, requestId: 'req_part_2',
      items: [{ orderItemId: order!.orderItems[0].id, quantity: 2 }], courierProvider: 'mock',
    })

    await applyCourierTrackingUpdate({ merchantId, packageId: a.package.id, providerName: 'mock', status: 'delivered', events: [], trigger: 'sync' })
    let orderRow = await prisma.order.findUnique({ where: { id: order!.id } })
    expect(orderRow!.fulfillmentSummaryStatus).toBe('partially_delivered')

    await applyCourierTrackingUpdate({ merchantId, packageId: b.package.id, providerName: 'mock', status: 'delivered', events: [], trigger: 'sync' })
    orderRow = await prisma.order.findUnique({ where: { id: order!.id } })
    expect(orderRow!.fulfillmentSummaryStatus).toBe('delivered')
  })

  it('stores courier connections encrypted and exposes a working webhook secret', async () => {
    const { saveCourierConnection, listCourierConnections, getCourierWebhookSecret, testCourierConnection } = await import('@/lib/couriers/connections')

    const saved = await saveCourierConnection({
      merchantId,
      provider: 'shiprocket',
      testMode: true,
      credentials: { email: 'store@test.dev', password: 'secret-password', pickupPostcode: '560001' },
    })
    expect(saved.status).toBe('connected')
    expect(saved.testMode).toBe(true)
    expect(saved.credentialsEncrypted).toContain('v1.')

    const secret = await getCourierWebhookSecret(merchantId, 'shiprocket')
    expect(secret).toMatch(/^cwhsec_/)

    // Test-connection round trip works for a simulated (mock) connection.
    const mockConn = (await listCourierConnections(merchantId)).find(c => c.provider === 'mock')
    const testResult = await testCourierConnection(mockConn!.id)
    expect(testResult.ok).toBe(true)
    // Live providers with invalid credentials report a graceful failure.
    const liveTest = await testCourierConnection(saved.id)
    expect(liveTest.ok).toBe(false)

    const listed = await listCourierConnections(merchantId)
    const sr = listed.find(c => c.provider === 'shiprocket')
    expect(sr).toBeTruthy()
    expect(sr!.has_credentials).toBe(true)
    // Secrets are never exposed through the list serializer.
    expect((sr as Record<string, unknown>).webhook_secret).toBeUndefined()
  })
})