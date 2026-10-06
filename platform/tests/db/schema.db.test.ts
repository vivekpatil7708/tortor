import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { runHealthChecks } from '@/lib/health'
import { resetDatabase } from './helpers'

beforeAll(resetDatabase)

describe('the real database (QA priority 1)', () => {
  it('has every table and column in schema.prisma, and each one can be read', async () => {
    const models = Prisma.dmmf.datamodel.models.map(m => m.name)
    expect(models.length).toBeGreaterThan(30)
    const client = prisma as unknown as Record<string, { findFirst(): Promise<unknown> }>
    for (const model of models) {
      await expect(client[model.charAt(0).toLowerCase() + model.slice(1)].findFirst(), model).resolves.toBeNull()
    }
  })

  it('the health check names a table with a missing column, as in the 6 October outage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runHealthChecks()).toEqual({ ok: true, failing: [] })

    await prisma.$executeRawUnsafe('ALTER TABLE merchants DROP COLUMN session_version')
    try {
      expect(await runHealthChecks()).toEqual({ ok: false, failing: ['merchants'] })
    } finally {
      // Put it back with the repo's own migration file, which also shows that file works.
      const sql = readFileSync(path.resolve(process.cwd(), 'prisma/migrations/add_session_version.sql'), 'utf8')
      await prisma.$executeRawUnsafe(sql.replace(/^--.*$/gm, '').trim())
      await prisma.$disconnect() // fresh connections, so no saved query remembers the old table
    }

    expect(await runHealthChecks()).toEqual({ ok: true, failing: [] })
  })
})
