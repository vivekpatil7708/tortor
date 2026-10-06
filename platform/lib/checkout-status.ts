// Used in the browser (customer payment page), so no Node-only imports here.
// The server stays the only judge of a payment's status; this file only asks.

/** After this long the page stops checking on its own; the customer can still tap "Check again". */
export const STOP_CHECKING_AFTER_MS = 30 * 60_000

/** Milliseconds until the next status check, or null to stop. Checks thin out as time passes. */
export function nextCheckDelay(elapsedMs: number): number | null {
  if (elapsedMs < 2 * 60_000) return 3_000
  if (elapsedMs < 10 * 60_000) return 10_000
  if (elapsedMs < STOP_CHECKING_AFTER_MS) return 30_000
  return null
}

export type CustomerView = 'waiting' | 'confirmed' | 'not-confirmed'

/** What a stored payment status means for the customer. Anything final but "success" is not confirmed. */
export function customerView(status: string): CustomerView {
  if (status === 'success') return 'confirmed'
  if (status === 'initiated' || status === 'pending') return 'waiting'
  return 'not-confirmed'
}

export const CLAIM_FAILED = "We couldn't save that. Please try again."
export const CLAIM_OFFLINE = 'You seem to be offline. Check your connection and tap the button again.'

export type ClaimResult = { ok: true; status: string } | { ok: false; error: string }

/** Tells the server the customer has paid. Only reports success when the server says it saved it. */
export async function claimPaid(txnId: string, fetchImpl: typeof fetch = fetch): Promise<ClaimResult> {
  let res: Response
  try {
    res = await fetchImpl(`/api/transactions/${encodeURIComponent(txnId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
  } catch {
    return { ok: false, error: CLAIM_OFFLINE }
  }
  const data = (await res.json().catch(() => null)) as { status?: unknown } | null
  if (!res.ok || typeof data?.status !== 'string') return { ok: false, error: CLAIM_FAILED }
  return { ok: true, status: data.status }
}

/** The stored status of a payment, or null when it can't be read right now. */
export async function fetchPaymentStatus(txnId: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`/api/transactions?txn_id=${encodeURIComponent(txnId)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { status?: unknown }
    return typeof data.status === 'string' ? data.status : null
  } catch {
    return null
  }
}
