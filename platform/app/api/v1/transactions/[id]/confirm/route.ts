import { NextRequest } from 'next/server'
import { setTransactionStatus } from '@/lib/v1-transaction-status'

/**
 * POST /api/v1/transactions/{id}/confirm — mark a payment as received (API key auth, write scope).
 * `id` is the transaction's txn_id (TXN...) or its internal id. Optional body:
 * payment_app, payer_vpa, upi_txn_id. A confirmed payment can only be undone
 * (with .../reject) within 30 minutes of confirming it.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return setTransactionStatus(req, props, 'success')
}
