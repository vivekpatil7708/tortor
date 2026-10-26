import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { canWrite } from '@/lib/team-roles'
import { zodMessage } from '@/lib/zod-error'
import { readTransactionFilters } from '@/lib/transaction-query'
import { googleSheetsExportSchema } from '@/lib/validators'
import { googleSheetsErrorResponse } from '@/lib/google-sheets/http'
import { exportTransactionsToSheets } from '@/lib/google-sheets/service'

/**
 * Manual "Export to Sheets" from the Transactions page. The request carries the
 * same filters as the list, so the sheet matches what the merchant is looking at.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!canWrite(session.teamRole)) {
      return apiError(403, 'You have view-only access to this account.')
    }

    const parsed = googleSheetsExportSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const params = new URLSearchParams()
    for (const key of ['status', 'from', 'to', 'link', 'q'] as const) {
      const value = parsed.data[key]
      if (value) params.set(key, value)
    }

    const filters = readTransactionFilters(params)
    if ('error' in filters) return apiError(400, filters.error)

    const result = await exportTransactionsToSheets({
      merchantId: session.id,
      filters,
    })
    return NextResponse.json(result)
  } catch (err) {
    return googleSheetsErrorResponse(err, 'Could not export to Google Sheets')
  }
}
