import { NextRequest } from 'next/server'
import { setTransactionStatus } from '@/lib/v1-transaction-status'

/**
 * POST /api/v1/transactions/{id}/reject — mark a payment as failed (API key auth, write scope).
 * `id` is the transaction's txn_id (TXN...) or its internal id. Rejecting a
 * confirmed payment is an undo and only allowed within 30 minutes of confirming.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return setTransactionStatus(req, props, 'failed')
}
