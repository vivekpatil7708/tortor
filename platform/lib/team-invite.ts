import { getEmailProvider } from '@/lib/emails/service'
import { renderTeamInviteEmail } from '@/lib/email'
import { TEAM_ROLE_LABELS, type TeamRole } from '@/lib/team-roles'

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.toropay.co.in').replace(/\/+$/, '')
}

export function teamInviteUrl(token: string): string {
  return `${appUrl()}/accept-invite/${encodeURIComponent(token)}`
}

/**
 * Send an invitation through the configured transactional email provider
 * (Resend in production, an in-memory mock in development/tests).
 */
export async function sendTeamInviteEmail(params: {
  to: string
  businessName: string
  inviterName: string
  role: TeamRole
  token: string
}): Promise<boolean> {
  const html = renderTeamInviteEmail({
    businessName: params.businessName,
    inviterName: params.inviterName,
    roleLabel: TEAM_ROLE_LABELS[params.role],
    inviteUrl: teamInviteUrl(params.token),
  })

  try {
    const result = await getEmailProvider().sendTransactionalEmail({
      to: params.to,
      subject: `${params.inviterName || 'The owner'} invited you to ${params.businessName || 'their business'} on ToroPay`,
      html,
    })
    if (!result.ok) {
      // Never log the recipient address or message body.
      console.error('Team invitation email failed:', result.error ?? 'provider rejected the email')
    }
    return result.ok
  } catch (err) {
    console.error('Team invitation email failed:', err instanceof Error ? err.name : 'unknown error')
    return false
  }
}
