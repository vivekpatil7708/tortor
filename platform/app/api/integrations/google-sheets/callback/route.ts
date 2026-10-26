import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { isOwnerRole } from '@/lib/team-roles'
import { googleOAuthConfigured, googleRedirectUri } from '@/lib/google-sheets/client'
import { connectGoogleAccount, readGoogleOAuthState } from '@/lib/google-sheets/service'

function settingsRedirect(req: NextRequest, result: string) {
  const url = new URL('/dashboard/settings', req.url)
  url.searchParams.set('tab', 'sheets')
  url.searchParams.set('google_sheets', result)
  return NextResponse.redirect(url)
}

/** Google sends the merchant back here after they approve (or cancel) access. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const providerError = params.get('error')
  if (providerError) {
    return settingsRedirect(req, providerError === 'access_denied' ? 'denied' : 'error')
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return settingsRedirect(req, 'error')

  try {
    const session = await requireSession()
    if (!isOwnerRole(session.teamRole)) return settingsRedirect(req, 'owner_only')
    if (!googleOAuthConfigured()) return settingsRedirect(req, 'not_configured')

    const savedState = await readGoogleOAuthState(state)
    if (
      !savedState ||
      savedState.merchantId !== session.id ||
      savedState.accountId !== session.accountId
    ) {
      return settingsRedirect(req, 'error')
    }

    await connectGoogleAccount({
      session,
      code,
      redirectUri: googleRedirectUri(req),
    })
    return settingsRedirect(req, 'connected')
  } catch (err) {
    console.error(
      'Google Sheets OAuth failed:',
      err instanceof Error ? err.message : 'unknown error',
    )
    return settingsRedirect(req, 'error')
  }
}
