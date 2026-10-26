import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { isOwnerRole } from '@/lib/team-roles'
import { zodMessage } from '@/lib/zod-error'
import { googleSheetsCreateSpreadsheetSchema } from '@/lib/validators'
import { googleSheetsErrorResponse } from '@/lib/google-sheets/http'
import {
  createGoogleSheetsSpreadsheet,
  serializeGoogleSheetsConnection,
} from '@/lib/google-sheets/service'

/** Create a fresh spreadsheet in the connected Google account. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!isOwnerRole(session.teamRole)) {
      return apiError(403, 'Only the account owner can change Google Sheets settings.')
    }

    const parsed = googleSheetsCreateSpreadsheetSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const connection = await createGoogleSheetsSpreadsheet({
      session,
      title: parsed.data.title,
    })
    return NextResponse.json({ connection: serializeGoogleSheetsConnection(connection) }, { status: 201 })
  } catch (err) {
    return googleSheetsErrorResponse(err, 'Could not create a Google spreadsheet')
  }
}
