import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hashInviteToken } from '@/lib/team-token'
import { isTeamRole, TEAM_ROLE_LABELS } from '@/lib/team-roles'
import { AcceptInviteForm } from './accept-invite-form'

export const metadata: Metadata = {
  title: 'Team invitation — ToroPay',
  robots: { index: false, follow: false },
}

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = token
    ? await prisma.teamMember.findUnique({
        where: { inviteToken: hashInviteToken(token) },
        include: {
          merchant: { select: { businessName: true, name: true, email: true, status: true } },
        },
      }).catch(() => null)
    : null

  const session = await getSession()
  const signedInEmail = session?.accountEmail ?? null

  let problem: string | null = null
  if (!invite) problem = 'This invitation link is invalid, has already been used, or was replaced by a newer invite.'
  else if (invite.merchant.status === 'suspended') problem = 'This business is not available.'
  else if (invite.acceptedAt) problem = 'This invitation has already been accepted.'
  else if (invite.inviteExpiresAt && invite.inviteExpiresAt < new Date()) problem = 'This invitation has expired. Ask the owner to resend it.'

  const businessName = invite?.merchant.businessName || invite?.merchant.name || invite?.merchant.email || 'the business'
  const roleLabel = invite && isTeamRole(invite.role) ? TEAM_ROLE_LABELS[invite.role] : 'team member'

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/70 p-8 shadow-sm backdrop-blur-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-extrabold tracking-tight">Toro<span className="text-primary-500">Pay</span></div>
          <h1 className="mt-3 text-xl font-bold tracking-tight">Join {businessName}</h1>
          {!problem && (
            <p className="mt-1 text-sm text-gray-500">
              You have been invited as a <span className="font-semibold text-charcoal">{roleLabel}</span>.
            </p>
          )}
        </div>

        {problem ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{problem}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/login" className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-semibold text-charcoal hover:bg-gray-50">
                Go to login
              </Link>
              <Link href="/dashboard" className="flex-1 rounded-xl bg-charcoal px-4 py-3 text-center text-sm font-semibold text-white hover:opacity-90">
                Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <AcceptInviteForm
            token={token}
            businessName={businessName}
            roleLabel={roleLabel}
            inviteEmail={invite!.email}
            signedInEmail={signedInEmail}
          />
        )}
      </div>
    </main>
  )
}
