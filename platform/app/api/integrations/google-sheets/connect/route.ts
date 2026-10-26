import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { isOwnerRole } from '@/lib/team-roles'
import { buildGoogleAuthUrl, googleOAuthConfigured, googleRedirectUri } from '@/lib/google-sheets/client'
import { createGoogleOAuthState } from '@/lib/google-sheets/service'

function settingsRedirect(req: NextRequest, result: string) {
  const url = new URL('/dashboard/settings', req.url)
  url.searchParams.set('tab', 'sheets')
  url.searchParams.set('google_sheets', result)
  return NextResponse.redirect(url)
}

/** Start the Google OAuth consent flow for the signed-in owner. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!isOwnerRole(session.teamRole)) return settingsRedirect(req, 'owner_only')
    if (!googleOAuthConfigured()) return settingsRedirect(req, 'not_configured')

    const state = await createGoogleOAuthState(session)
    const redirectUri = googleRedirectUri(req)
    return NextResponse.redirect(buildGoogleAuthUrl(state, redirectUri))
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}
