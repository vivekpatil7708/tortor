import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { resetDatabase } from './helpers'

beforeAll(resetDatabase)

/**
 * The ops team applies the hand-written SQL in prisma/migrations by hand, so
 * this runs the same file the repo ships and checks it produces the schema the
 * code expects. It is written to be run twice, because a migration that cannot
 * be re-applied safely is a migration that will fail on the second deploy.
 */
function migrationStatements(name: string) {
  const sql = readFileSync(path.resolve(process.cwd(), 'prisma/migrations', name), 'utf8')
  // Comments are dropped, then the file is split on its semicolons, because a
  // raw query is sent as one prepared statement and cannot hold many commands.
  return sql
    .replace(/^--.*$/gm, '')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)
}

const BROADCAST_COLUMNS: Array<[string, string, string]> = [
  ['message_logs', 'campaign_id', 'text'],
  ['feedback_responses', 'merchant_id', 'text'],
  ['feedback_responses', 'campaign_id', 'text'],
  ['feedback_responses', 'merchant_email', 'text'],
  ['feedback_responses', 'status', 'text'],
  ['feedback_responses', 'admin_note', 'text'],
  ['feedback_responses', 'reviewed_at', 'timestamp without time zone'],
]

describe('the broadcast migration (PR 2)', () => {
  it('adds the tables and columns the campaign code needs', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('broadcast_campaigns', 'email_suppressions')
    `
    expect(tables.map(t => t.table_name).sort()).toEqual(['broadcast_campaigns', 'email_suppressions'])

    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; data_type: string }>>`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('message_logs', 'campaign_id'),
          ('feedback_responses', 'merchant_id'),
          ('feedback_responses', 'campaign_id'),
          ('feedback_responses', 'merchant_email'),
          ('feedback_responses', 'status'),
          ('feedback_responses', 'admin_note'),
          ('feedback_responses', 'reviewed_at')
        )
    `
    const found = new Map(columns.map(c => [`${c.table_name}.${c.column_name}`, c.data_type]))
    for (const [table, column, type] of BROADCAST_COLUMNS) {
      expect(found.get(`${table}.${column}`), `${table}.${column}`).toBe(type)
    }
  })

  it('can be applied again without changing anything', async () => {
    // Applying it a second time must be safe, or the next deploy breaks.
    for (const statement of migrationStatements('add_broadcast_campaigns.sql')) {
      await prisma.$executeRawUnsafe(statement)
    }

    const campaigns = await prisma.broadcastCampaign.count()
    const suppressions = await prisma.emailSuppression.count()
    expect(campaigns).toBe(0)
    expect(suppressions).toBe(0)

    // The columns are still there and still usable.
    const log = await prisma.messageLog.findFirst()
    expect(log).toBeNull()
  })

  it('keeps a message log tied to a campaign when the campaign is read back', async () => {
    const merchant = await prisma.merchant.create({
      data: { email: 'migration@example.com', phone: '9000000001', businessName: 'Migration Store' },
    })
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        name: 'Migration check',
        subject: 'Hello',
        body: 'Body',
        audience: JSON.stringify({ status: 'active' }),
        createdBy: 'ops@toropay.co.in',
      },
    })
    await prisma.messageLog.create({
      data: {
        merchantId: merchant.id,
        channel: 'email',
        recipient: merchant.email,
        subject: 'Hello',
        renderedBody: 'Body',
        provider: 'resend',
        createdBy: 'ops@toropay.co.in',
        idempotencyKey: `${campaign.id}:${merchant.id}`,
        campaignId: campaign.id,
      },
    })

    const read = await prisma.messageLog.findFirst({ where: { campaignId: campaign.id } })
    expect(read?.merchantId).toBe(merchant.id)
    expect(read?.status).toBe('pending')
  })
})
