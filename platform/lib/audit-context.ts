import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { isTeamRole, type TeamRole } from '@/lib/team-roles'

/**
 * The signed-in person behind the current request. Audit writes deep inside
 * shared helpers (orders, refunds, couriers) use this to record who did the
 * action without threading an actor parameter through every function.
 */
export interface AuditActor {
  teamMemberId?: string | null
  name?: string | null
  email?: string | null
  role?: TeamRole | null
}

const COOKIE_NAME = 'toropay_session'
const IMPERSONATE_COOKIE = 'toropay_impersonate'

function getSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET
  return secret ? new TextEncoder().encode(secret) : null
}

/**
 * Read the actor from the request's login cookie.
 *
 * This deliberately reads the cookie instead of relying on AsyncLocalStorage:
 * a store set after an `await` does not reach the caller, so request handlers
 * would lose the actor. The signature check makes the claims trustworthy; the
 * route has already enforced the session version before it gets this far.
 */
export async function getAuditActor(): Promise<AuditActor | null> {
  try {
    const store = await cookies()
    const secret = getSecret()
    if (!secret) return null

    const impToken = store.get(IMPERSONATE_COOKIE)?.value
    if (impToken) {
      try {
        const { payload } = await jwtVerify(impToken, secret)
        if (payload.typ === 'impersonate') {
          const adminEmail = typeof payload.admin_email === 'string' ? payload.admin_email : null
          return { teamMemberId: null, name: adminEmail ? `Admin (${adminEmail})` : 'Admin', email: adminEmail, role: null }
        }
      } catch {
        // Fall through to the normal login cookie.
      }
    }

    const token = store.get(COOKIE_NAME)?.value
    if (!token) return null

    const { payload } = await jwtVerify(token, secret)
    if (payload.typ || payload.purpose || typeof payload.sub !== 'string') return null

    const switchingMerchant = typeof payload.mid === 'string' && payload.mid !== payload.sub
    return {
      teamMemberId: typeof payload.tmid === 'string' ? payload.tmid : null,
      name: typeof payload.tname === 'string' ? payload.tname : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      role: isTeamRole(payload.role) ? payload.role : switchingMerchant ? 'viewer' : 'owner',
    }
  } catch {
    // No request cookie store (background job, tests without a request) or a
    // token that no longer verifies.
    return null
  }
}
