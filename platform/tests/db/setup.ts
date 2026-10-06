import { vi } from 'vitest'

// Database tests read and delete real rows, so they only ever run against a
// throwaway local database (see scripts/test-db.mjs). This runs before every
// test file, before anything opens a database connection.
const url = process.env.TEST_DATABASE_URL
if (!url) {
  throw new Error('Database tests need TEST_DATABASE_URL pointing at a throwaway local Postgres (see docs/qa-plan.md).')
}
const { hostname } = new URL(url)
if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
  throw new Error(`Database tests delete data, so they only run against localhost, not ${hostname}.`)
}
process.env.DATABASE_URL = url

// Prisma also reads platform/.env when it exists. Setting every key the app
// uses first means none of the real ones are picked up: no real emails, payment
// providers, messages or secrets during tests.
Object.assign(process.env, {
  JWT_SECRET: 'db-tests-jwt-secret',
  APP_ENCRYPTION_KEY: 'db-tests-encryption-key',
  API_KEY_PEPPER: 'db-tests-pepper',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  PAYMENTS_ALLOW_MOCK: 'true',
  MOCK_WEBHOOK_SECRET: 'db-tests-mock-webhook-secret',
  MESSAGING_ALLOW_MOCK: 'true',
  RESEND_API_KEY: '', RESEND_FROM: '', RESEND_REPLY_TO: '', EMAIL_FROM: '', SUPPORT_EMAIL: '',
  RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '', RAZORPAY_API_BASE: '',
  CASHFREE_APP_ID: '', CASHFREE_SECRET_KEY: '', CASHFREE_WEBHOOK_SECRET: '',
  SETU_BASE_URL: '', SETU_CLIENT_ID: '', SETU_CLIENT_SECRET: '',
  TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', WHATSAPP_GRAPH_API: '', WHATSAPP_GRAPH_VERSION: '',
  INSTAGRAM_MESSAGING_ENABLED: '', GOOGLE_CLIENT_ID: '', NEXT_PUBLIC_GOOGLE_CLIENT_ID: '',
  ADMIN_EMAIL: '', ADMIN_TOTP_SECRET: '', CRON_SECRET: '', CORS_ORIGINS: '',
})

// Login: the dashboard routes see whichever merchant the test signed in.
vi.mock('@/lib/auth', async (importOriginal) => {
  const { testState } = await import('./state')
  const real = await importOriginal<typeof import('@/lib/auth')>()
  return {
    ...real,
    getSession: vi.fn(async () => testState.signedIn),
    requireSession: vi.fn(async () => {
      if (!testState.signedIn) throw new Error('Unauthorized')
      return testState.signedIn
    }),
  }
})

// after(): collected so a test can run it when it chooses.
vi.mock('next/server', async (importOriginal) => {
  const { testState } = await import('./state')
  const real = await importOriginal<typeof import('next/server')>()
  return { ...real, after: (task: () => unknown) => { testState.afterTasks.push(task) } }
})

// Webhooks to merchants' websites are recorded, never sent.
vi.mock('@/lib/safe-fetch', async (importOriginal) => {
  const { testState } = await import('./state')
  const real = await importOriginal<typeof import('@/lib/safe-fetch')>()
  return {
    ...real,
    postWebhook: vi.fn(async (url: string, opts: { body: string }) => {
      testState.webhooks.push({ url, body: opts.body })
      return { status: 200, ok: true, body: 'ok' }
    }),
  }
})
