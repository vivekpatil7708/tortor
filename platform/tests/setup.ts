import { beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

const TABLES = [
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