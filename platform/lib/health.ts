import { prisma } from '@/lib/prisma'

/**
 * Does the database have every column the code expects? Each check asks a
 * table for all its columns but matches no row, so the database validates the
 * columns without any data being read. A missing column (say, a migration that
 * wasn't run) makes that table's check fail.
 */

const NO_ROW = '00000000-0000-0000-0000-000000000000'

/** The tables that logins, payment links and webhooks depend on. */
export const SCHEMA_CHECKS: Record<string, () => Promise<unknown>> = {
  merchants: () => prisma.merchant.findFirst({ where: { id: NO_ROW } }),
  payment_links: () => prisma.paymentLink.findFirst({ where: { id: NO_ROW } }),
  transactions: () => prisma.transaction.findFirst({ where: { id: NO_ROW } }),
  merchant_settings: () => prisma.merchantSettings.findFirst({ where: { merchantId: NO_ROW } }),
  audit_logs: () => prisma.auditLog.findFirst({ where: { id: NO_ROW } }),
  webhook_logs: () => prisma.webhookLog.findFirst({ where: { id: NO_ROW } }),
}

export async function runHealthChecks(checks = SCHEMA_CHECKS): Promise<{ ok: boolean; failing: string[] }> {
  const names = Object.keys(checks)
  const results = await Promise.allSettled(names.map(name => checks[name]()))
  const failing: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') return
    failing.push(names[i])
    // Details stay in the server logs; the public answer only names the table.
    const code = (result.reason as { code?: string } | null)?.code
    console.error(`Health check failed for ${names[i]}:`, code ?? result.reason)
  })
  return { ok: failing.length === 0, failing }
}
