import { PrismaClient, PaymentStatus, OrderStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { generateOrderNumber, generateFulfillmentNumber } from '../lib/status'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('demo123', 12)

  const merchant = await prisma.merchant.upsert({
    where: { email: 'demo@toropay.in' },
    update: {},
    create: {
      email: 'demo@toropay.in',
      phone: '9876543210',
      passwordHash,
      businessName: 'Demo Store',
      brandColorPrimary: '#7bb86c',
      brandColorSecondary: '#2c2c2c',
      onboardingComplete: true,
      supportEmail: 'support@toropay.in',
      supportPhone: '9876543210',
      timezone: 'Asia/Kolkata',
      defaultCurrency: 'INR',
      settings: {
        create: {
          notificationEmail: 'demo@toropay.in',
          autoSettlement: true,
        },
      },
    },
  })

  await prisma.merchantUser.upsert({
    where: { merchantId_email: { merchantId: merchant.id, email: 'demo@toropay.in' } },
    update: {},
    create: {
      merchantId: merchant.id,
      name: 'Demo Owner',
      email: 'demo@toropay.in',
      passwordHash,
      role: 'owner',
    },
  })

  await prisma.upiId.upsert({
    where: { merchantId_vpa: { merchantId: merchant.id, vpa: 'demo@paytm' } },
    update: { verifiedAt: new Date(), isPrimary: true },
    create: {
      merchantId: merchant.id,
      vpa: 'demo@paytm',
      isPrimary: true,
      verifiedAt: new Date(),
    },
  })

  const slug = 'demo-booking'
  await prisma.paymentLink.upsert({
    where: { slug },
    update: {},
    create: {
      merchantId: merchant.id,
      upiId: 'demo@paytm',
      title: 'Badminton Court Booking',
      description: 'Pay for your court slot via UPI',
      amount: 500,
      slug,
      customFields: JSON.stringify([
        { name: 'court', label: 'Court Number', type: 'text', required: false },
      ]),
    },
  })

  // ============================================================
  // Phase 1 seed data
  // ============================================================

  // Products
  const tshirt = await prisma.product.upsert({
    where: { id: 'seed-product-tshirt' },
    update: {},
    create: {
      id: 'seed-product-tshirt',
      merchantId: merchant.id,
      name: 'Organic Cotton T-Shirt',
      description: 'Comfortable everyday tee',
      sku: 'TSH-001',
      price: 499,
      compareAtPrice: 699,
      productType: 'physical',
      status: 'active',
      stockQuantity: 40,
      lowStockThreshold: 10,
    },
  })

  const shoes = await prisma.product.upsert({
    where: { id: 'seed-product-shoes' },
    update: {},
    create: {
      id: 'seed-product-shoes',
      merchantId: merchant.id,
      name: 'Running Shoes',
      description: 'Lightweight running shoes',
      sku: 'RUN-002',
      price: 2499,
      productType: 'physical',
      status: 'active',
      stockQuantity: 15,
      lowStockThreshold: 5,
    },
  })

  const eGuide = await prisma.product.upsert({
    where: { id: 'seed-product-guide' },
    update: {},
    create: {
      id: 'seed-product-guide',
      merchantId: merchant.id,
      name: 'Starter E-Commerce Guide (PDF)',
      sku: 'DIG-003',
      price: 199,
      productType: 'digital',
      status: 'active',
    },
  })

  // Customers
  const custA = await prisma.customer.upsert({
    where: { id: 'seed-customer-a' },
    update: {},
    create: {
      id: 'seed-customer-a',
      merchantId: merchant.id,
      fullName: 'Rohan Mehta',
      phone: '9812345678',
      email: 'rohan@example.com',
      tags: JSON.stringify(['wholesale', 'priority']),
      notes: 'Prefers WhatsApp updates',
    },
  })

  const custB = await prisma.customer.upsert({
    where: { id: 'seed-customer-b' },
    update: {},
    create: {
      id: 'seed-customer-b',
      merchantId: merchant.id,
      fullName: 'Priya Sharma',
      phone: '9822223344',
      email: 'priya@example.com',
      tags: JSON.stringify(['instagram']),
    },
  })

  await prisma.customerAddress.upsert({
    where: { id: 'seed-address-a' },
    update: {},
    create: {
      id: 'seed-address-a',
      merchantId: merchant.id,
      customerId: custA.id,
      label: 'Home',
      recipientName: 'Rohan Mehta',
      phone: '9812345678',
      line1: '12, MG Road',
      line2: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      isDefault: true,
    },
  })

  // Orders with split shipments
  const order1 = await prisma.order.upsert({
    where: { id: 'seed-order-1' },
    update: {},
    create: {
      id: 'seed-order-1',
      merchantId: merchant.id,
      customerId: custA.id,
      orderNumber: 'TP-2026-1001',
      source: 'instagram',
      subtotalAmount: 2998,
      discountAmount: 200,
      shippingAmount: 49,
      taxAmount: 0,
      totalAmount: 2847,
      paymentStatus: 'paid',
      orderStatus: 'processing',
      fulfillmentSummaryStatus: 'partially_fulfilled',
      paidAt: new Date(),
      trackingToken: 'track-token-order1',
      shippingAddressSnapshot: {
        recipient_name: 'Rohan Mehta',
        phone: '9812345678',
        line1: '12, MG Road',
        line2: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      },
      orderItems: {
        create: [
          { productId: tshirt.id, productNameSnapshot: 'Organic Cotton T-Shirt', skuSnapshot: 'TSH-001', unitPrice: 499, quantityOrdered: 2, quantityFulfilled: 1, lineTotal: 998 },
          { productId: shoes.id, productNameSnapshot: 'Running Shoes', skuSnapshot: 'RUN-002', unitPrice: 2499, quantityOrdered: 1, lineTotal: 2499 },
        ],
      },
    },
  })

  const f1 = await prisma.fulfillment.upsert({
    where: { id: 'seed-fulfillment-1' },
    update: {},
    create: {
      id: 'seed-fulfillment-1',
      merchantId: merchant.id,
      orderId: order1.id,
      fulfillmentNumber: 'F-SEED1',
      fulfillmentType: 'shipping',
      status: 'shipped',
      shippedAt: new Date(),
      items: {
        create: [
          { orderItemId: (await prisma.orderItem.findFirst({ where: { orderId: order1.id, productId: tshirt.id } }))!.id, quantity: 1 },
        ],
      },
      packages: {
        create: [
          {
            merchantId: merchant.id,
            courierProvider: 'Delhivery',
            trackingNumber: 'DEL123456789',
            trackingUrl: 'https://www.delhivery.com/track/package/DEL123456789',
            packageStatus: 'shipped',
            shippedAt: new Date(),
          },
        ],
      },
    },
  })

  await prisma.orderStatusHistory.createMany({
    data: [
      { merchantId: merchant.id, orderId: order1.id, previousStatus: null, newStatus: 'new', statusType: 'order', changedByType: 'merchant', changeReason: 'Order created (seed)' },
      { merchantId: merchant.id, orderId: order1.id, previousStatus: 'new', newStatus: 'processing', statusType: 'order', changedByType: 'merchant', changeReason: 'Processing (seed)' },
      { merchantId: merchant.id, orderId: order1.id, previousStatus: 'unfulfilled', newStatus: 'partially_fulfilled', statusType: 'fulfillment', changedByType: 'system', changeReason: 'Fulfillment created (seed)' },
    ],
  })

  // Second merchant to prove tenant isolation
  const merchant2 = await prisma.merchant.upsert({
    where: { email: 'other@toropay.in' },
    update: {},
    create: {
      email: 'other@toropay.in',
      phone: '9123456789',
      passwordHash,
      businessName: 'Other Store',
      onboardingComplete: true,
    },
  })

  await prisma.merchantUser.upsert({
    where: { merchantId_email: { merchantId: merchant2.id, email: 'other@toropay.in' } },
    update: {},
    create: {
      merchantId: merchant2.id,
      name: 'Other Owner',
      email: 'other@toropay.in',
      passwordHash,
      role: 'owner',
    },
  })

  const otherCustomer = await prisma.customer.upsert({
    where: { id: 'seed-other-customer' },
    update: {},
    create: {
      id: 'seed-other-customer',
      merchantId: merchant2.id,
      fullName: 'Sneha Nair',
      phone: '9090909090',
    },
  })

  await prisma.order.upsert({
    where: { id: 'seed-other-order' },
    update: {},
    create: {
      id: 'seed-other-order',
      merchantId: merchant2.id,
      customerId: otherCustomer.id,
      orderNumber: 'TP-2026-9001',
      source: 'manual_order',
      subtotalAmount: 10,
      totalAmount: 10,
      paymentStatus: 'pending',
      orderStatus: 'new',
      trackingToken: 'track-token-other',
    },
  })

  console.log('Seed complete!')
  console.log('Login: demo@toropay.in / demo123')
  console.log('Login: other@toropay.in / demo123 (tenant isolation test)')
  console.log('Payment link: /pay/demo-booking')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())