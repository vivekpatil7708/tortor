import { beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

const TABLES = [
  'courier_webhook_events',
  'courier_connections',
  'webhook_delivery_logs',
  'webhook_endpoints',
  'webhook_events',
  'email_logs',
  'email_templates',
  'api_request_logs',
  'api_keys',
  'payments',
  'checkout_links',
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
  'merchant_users',
  'merchant_settings',
  'automation_rules',
  'message_logs',
  'message_templates',
  'channel_connections',
  'follow_up_tasks',
  'returns',
  'return_items',
  'refunds',
  'inventory_adjustments',
]

async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE ' + TABLES.join(', ') + ' RESTART IDENTITY CASCADE')
}

beforeAll(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

export { prisma }