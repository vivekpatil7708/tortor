import { beforeEach, describe, expect, it, vi } from 'vitest'

// The database health check (lib/health.ts and GET /api/health) with the
// database replaced by fakes.
const db = vi.hoisted(() => ({
  merchant: { findFirst: vi.fn() },
  paymentLink: { findFirst: vi.fn() },
  transaction: { findFirst: vi.fn() },
  merchantSettings: { findFirst: vi.fn() },
  auditLog: { findFirst: vi.fn() },
  webhookLog: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const missingColumn = Object.assign(new Error('The column `merchants.email_verified_at` does not exist in the current database.'), { code: 'P2022' })

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const model of Object.values(db)) model.findFirst.mockReset().mockResolvedValue(null)
})

describe('runHealthChecks', () => {
  it('is ok when every table has the columns the code expects', async () => {
    const { runHealthChecks } = await import('@/lib/health')
    expect(await runHealthChecks()).toEqual({ ok: true, failing: [] })
  })

  it('names the table whose columns are out of date', async () => {
    db.merchant.findFirst.mockRejectedValue(missingColumn)
    const { runHealthChecks } = await import('@/lib/health')
    expect(await runHealthChecks()).toEqual({ ok: false, failing: ['merchants'] })
  })

  it('asks for every column but matches no row, so no data is read', async () => {
    const { SCHEMA_CHECKS } = await import('@/lib/health')
    for (const check of Object.values(SCHEMA_CHECKS)) await check()
    for (const model of Object.values(db)) {
      const [args] = model.findFirst.mock.calls[0]
      expect(args).not.toHaveProperty('select')
      expect(Object.values(args.where)).toEqual(['00000000-0000-0000-0000-000000000000'])
    }
  })
})

describe('GET /api/health', () => {
  it('answers 200 ok when healthy', async () => {
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('answers 503 with only the failing table names, no error details', async () => {
    db.merchant.findFirst.mockRejectedValue(missingColumn)
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    const text = await res.text()
    expect(res.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ ok: false, failing: ['merchants'] })
    expect(text).not.toContain('email_verified_at')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
