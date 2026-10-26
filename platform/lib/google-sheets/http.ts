import { apiError, intentionalErrorMessage, publicErrorMessage } from '@/lib/api-response'
import { GOOGLE_SHEETS_SETUP_MESSAGE, isMissingGoogleSheetsTable } from './service'

/** The same error mapping for every Google Sheets route. */
export function googleSheetsErrorResponse(err: unknown, fallback: string) {
  if (isMissingGoogleSheetsTable(err)) return apiError(503, GOOGLE_SHEETS_SETUP_MESSAGE)
  const message = publicErrorMessage(err, fallback)
  if (message === 'Unauthorized') return apiError(401, message)
  return apiError(intentionalErrorMessage(err) ? 400 : 500, message)
}
