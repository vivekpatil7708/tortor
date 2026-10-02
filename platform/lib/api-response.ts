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

export function handleError(err: unknown, fallback = 'Request failed') {
  const msg = err instanceof Error ? err.message : fallback
  if (msg === 'Unauthorized') return unauthorized()
  return apiError(500, msg)
}