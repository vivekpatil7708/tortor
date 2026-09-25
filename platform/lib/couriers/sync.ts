import { prisma } from '@/lib/prisma'
import { syncPackageFromProvider } from './shipments'

export interface SyncResult {
  scanned: number
  synced: number
  errors: number
  details: Array<{ packageId: string; ok: boolean; status?: string; error?: string }>
}

export const ACTIVE_SYNC_STATES = ['not_shipped', 'shipped', 'in_transit', 'out_for_delivery'] as const

/**
 * Reconciliation job: pull the latest status from the courier for every active
 * provider-backed package and apply monotonic tracking updates. Runs on an
 * interval (see the cron entry in instrumentation / an admin endpoint) and can
 * be scoped to an optional time window so followed-up syncs stay cheap.
 */
export async function syncActiveShipments(params?: {
  merchantId?: string
  maxAgeMs?: number
  limit?: number
}): Promise<SyncResult> {
  const { merchantId, maxAgeMs = 10 * 60 * 1000, limit = 100 } = params ?? {}
  const cutoff = new Date(Date.now() - maxAgeMs)

  const packages = await prisma.package.findMany({
    where: {
      ...(merchantId ? { merchantId } : {}),
      provider: { not: 'mock' },
      packageStatus: { in: [...ACTIVE_SYNC_STATES] },
      OR: [{ lastProviderSyncAt: null }, { lastProviderSyncAt: { lt: cutoff } }],
    },
    select: { id: true, merchantId: true, awbNumber: true, providerShipmentId: true, lastProviderSyncAt: true },
    orderBy: { lastProviderSyncAt: 'asc' },
    take: limit,
  })

  const details: SyncResult['details'] = []
  for (const pkg of packages) {
    try {
      const result = await syncPackageFromProvider({ merchantId: pkg.merchantId, packageId: pkg.id })
      if ('skipped' in result) {
        details.push({ packageId: pkg.id, ok: true, status: 'skipped', error: result.reason })
        continue
      }
      details.push({
        packageId: pkg.id,
        ok: true,
        status: result.newStatus,
        error: result.skippedReason,
      })
    } catch (err) {
      details.push({ packageId: pkg.id, ok: false, error: err instanceof Error ? err.message : 'Sync failed' })
    }
  }

  return {
    scanned: packages.length,
    synced: details.filter(d => d.ok && d.status).length,
    errors: details.filter(d => !d.ok).length,
    details,
  }
}