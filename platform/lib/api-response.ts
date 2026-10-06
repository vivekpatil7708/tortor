import { NextResponse } from 'next/server'

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorized() {
  return apiError(401, 'Unauthorized')
}

export function forbidden() {
  return apiError(403, 'Forbidden')
}

export function badRequest(message: string) {
  return apiError(400, message)
}

export function notFound(message = 'Not found') {
  return apiError(404, message)
}

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Text that is safe to show for a caught error. Messages the app throws on
 * purpose (plain Errors such as "Order not found") are kept. Database, network
 * and programming errors become a generic message, with the details logged on
 * the server instead.
 */
export function publicErrorMessage(err: unknown, fallback = GENERIC_ERROR): string {
  if (!(err instanceof Error)) return fallback
  const intentional = intentionalErrorMessage(err)
  if (intentional !== null) return intentional
  console.error('Unexpected error:', err)
  return GENERIC_ERROR
}

/** The message of an error the app threw on purpose, or null for database and system errors. */
export function intentionalErrorMessage(err: unknown): string | null {
  return err instanceof Error && err.constructor === Error && !('code' in err) ? err.message : null
}

export function handleError(err: unknown, fallback = 'Request failed') {
  const msg = publicErrorMessage(err, fallback)
  if (msg === 'Unauthorized') return unauthorized()
  return apiError(500, msg)
}