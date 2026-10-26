import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { apiError, handleError } from '@/lib/api-response'
import { isOwnerRole } from '@/lib/team-roles'
import { zodMessage } from '@/lib/zod-error'
import { googleSheetsSettingsSchema } from '@/lib/validators'
import { googleSheetsErrorResponse } from '@/lib/google-sheets/http'
import {
  disconnectGoogleSheets,
  getGoogleSheetsStatus,
  saveGoogleSheetsSpreadsheet,
  serializeGoogleSheetsConnection,
} from '@/lib/google-sheets/service'

const OWNER_ONLY = 'Only the account owner can change Google Sheets settings.'

/** Connection status for Settings. Never returns an OAuth token. */
export async function GET() {
  try {
    const session = await requireSession()
    return NextResponse.json(await getGoogleSheetsStatus(session))
  } catch (err) {
    return handleError(err, 'Could not load Google Sheets settings')
  }
}

/** Save the chosen spreadsheet, tab, or automatic-export preference. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!isOwnerRole(session.teamRole)) return apiError(403, OWNER_ONLY)

    const parsed = googleSheetsSettingsSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(400, zodMessage(parsed.error) || 'Invalid request')

    const connection = await saveGoogleSheetsSpreadsheet({
      session,
      spreadsheet: parsed.data.spreadsheet,
      sheetName: parsed.data.sheet_name,
      autoExport: parsed.data.auto_export,
    })
    return NextResponse.json({ connection: serializeGoogleSheetsConnection(connection) })
  } catch (err) {
    return googleSheetsErrorResponse(err, 'Could not save Google Sheets settings')
  }
}

/** Forget the Google account. Rows already written to the sheet are untouched. */
export async function DELETE() {
  try {
    const session = await requireSession()
    if (!isOwnerRole(session.teamRole)) return apiError(403, OWNER_ONLY)
    await disconnectGoogleSheets(session)
    return NextResponse.json({ success: true })
  } catch (err) {
    return googleSheetsErrorResponse(err, 'Could not disconnect Google Sheets')
  }
}
