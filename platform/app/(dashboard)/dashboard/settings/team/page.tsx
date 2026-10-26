'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDateTime, humanize } from '@/lib/ui-format'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { LoadError } from '@/components/ui/load-error'
import { useToast } from '@/components/toast'
import { MailPlus, RefreshCw, Trash2, Users } from 'lucide-react'
import { TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_LABELS, type TeamRole } from '@/lib/team-roles'

type TeamData = Awaited<ReturnType<typeof api.getTeam>>
type Member = TeamData['members'][number]

const ACTION_LABELS: Record<string, string> = {
  team_member_invited: 'invited a team member',
  team_invite_resent: 'resent a team invitation',
  team_member_joined: 'accepted an invitation',
  team_member_role_changed: 'changed a team member role',
  team_member_removed: 'removed a team member',
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? humanize(action).toLowerCase()
}

function roleTone(role: string): BadgeTone {
  if (role === 'owner') return 'green'
  if (role === 'admin') return 'blue'
  return 'gray'
}

function statusTone(status: string): BadgeTone {
  if (status === 'accepted') return 'green'
  if (status === 'pending') return 'yellow'
  return 'red'
}

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200'

export default function TeamPage() {
  const { toast } = useToast()
  const [data, setData] = useState<TeamData | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteWarning, setInviteWarning] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoadState('loading')
    try {
      const next = await api.getTeam()
      setData(next)
      setLoadState('ready')
    } catch {
      if (!silent) setLoadState('failed')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isOwner = data?.me.role === 'owner'
  const roleLabel = (value: string) => TEAM_ROLE_LABELS[value as TeamRole] ?? value

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteWarning('')
    setInviting(true)
    try {
      const result = await api.inviteTeamMember({ email: email.trim(), role })
      setEmail('')
      if (result.email_sent) toast('Invitation sent')
      else {
        setInviteWarning(result.warning || 'The invitation was saved, but the email could not be sent.')
        toast('Invitation saved, email not sent', 'error')
      }
      await load(true)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not send the invitation', 'error')
    } finally {
      setInviting(false)
    }
  }

  async function changeRole(member: Member, nextRole: 'admin' | 'viewer') {
    setBusyId(member.id)
    try {
      await api.updateTeamMember(member.id, nextRole)
      toast(member.status === 'accepted' ? 'Role updated. They will sign in again to use it.' : 'Role updated')
      await load(true)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not update the role', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function resend(member: Member) {
    setBusyId(member.id)
    try {
      const result = await api.resendTeamInvite(member.id)
      if (result.email_sent) toast('Invitation resent')
      else toast(result.warning || 'Could not send the email', 'error')
      await load(true)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not resend the invitation', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(member: Member) {
    if (!confirm(`Remove ${member.name || member.email} from the team? They will lose access immediately.`)) return
    setBusyId(member.id)
    try {
      await api.removeTeamMember(member.id)
      toast('Team member removed')
      await load(true)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not remove the team member', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loadState === 'loading') {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-gray-500">
        <Users className="h-4 w-4" /> Loading your team…
      </div>
    )
  }

  if (loadState === 'failed' || !data) {
    return <LoadError what="your team" onRetry={() => load()} />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-gray-500">
          Give teammates their own login to this business dashboard. You are signed in as{' '}
          <span className="font-medium text-charcoal">{data.me.email}</span> ({roleLabel(data.me.role)}).
        </p>
      </div>

      {!isOwner && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">
          {data.me.role === 'admin'
            ? 'Admins can manage payments and operations but cannot change team access, account security settings or billing.'
            : 'You have view-only access. Ask the owner for admin access if you need to make changes.'}
        </div>
      )}

      {isOwner && (
        <section className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <MailPlus className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-bold">Invite a team member</h2>
          </div>
          <form onSubmit={sendInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="team-email" className="mb-1 block text-xs font-semibold text-gray-600">
                Email address
              </label>
              <input
                id="team-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className={inputClass}
              />
            </div>
            <div className="sm:w-52">
              <label htmlFor="team-role" className="mb-1 block text-xs font-semibold text-gray-600">
                Access level
              </label>
              <select id="team-role" value={role} onChange={e => setRole(e.target.value as 'admin' | 'viewer')} className={inputClass}>
                <option value="viewer">Viewer — read only</option>
                <option value="admin">Admin — manage payments</option>
              </select>
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invite'}
            </Button>
          </form>
          {inviteWarning && <p className="mt-3 text-sm text-amber-700">{inviteWarning}</p>}
          <div className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
            <p><span className="font-semibold text-gray-700">Owner</span> — {TEAM_ROLE_DESCRIPTIONS.owner}</p>
            <p><span className="font-semibold text-gray-700">Admin</span> — {TEAM_ROLE_DESCRIPTIONS.admin}</p>
            <p><span className="font-semibold text-gray-700">Viewer</span> — {TEAM_ROLE_DESCRIPTIONS.viewer}</p>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-bold">People with access</h2>
          <span className="text-xs text-gray-500">{data.members.length} member{data.members.length === 1 ? '' : 's'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Invited</th>
                {isOwner && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.members.map(member => (
                <tr key={member.id} className="border-t border-gray-100">
                  <td className="px-5 py-3">
                    <div className="font-medium text-charcoal">
                      {member.name}
                      {member.is_you && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">You</span>}
                    </div>
                    {member.name !== member.email && <div className="text-xs text-gray-500">{member.email}</div>}
                  </td>
                  <td className="px-5 py-3">
                    {isOwner && member.role !== 'owner' ? (
                      <select
                        value={member.role === 'admin' ? 'admin' : 'viewer'}
                        disabled={busyId === member.id}
                        onChange={e => changeRole(member, e.target.value as 'admin' | 'viewer')}
                        aria-label={`Role for ${member.email}`}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-gray-500"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <Badge tone={roleTone(member.role)}>{roleLabel(member.role)}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(member.status)}>
                      {member.status === 'accepted' ? 'Active' : member.status === 'pending' ? 'Invite pending' : 'Invite expired'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {formatDateTime(member.invited_at)}
                    {member.status !== 'accepted' && member.invite_expires_at && (
                      <div className="text-[11px] text-gray-400">Expires {formatDateTime(member.invite_expires_at)}</div>
                    )}
                  </td>
                  {isOwner && (
                    <td className="px-5 py-3">
                      {member.role === 'owner' ? (
                        <p className="text-right text-xs text-gray-400">Account owner</p>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {member.status !== 'accepted' && (
                            <button
                              type="button"
                              onClick={() => resend(member)}
                              disabled={busyId === member.id}
                              title="Resend invitation"
                              aria-label={`Resend invitation to ${member.email}`}
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-charcoal disabled:opacity-40"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(member)}
                            disabled={busyId === member.id}
                            title="Remove access"
                            aria-label={`Remove ${member.email}`}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
        <h2 className="text-sm font-bold">Recent activity</h2>
        <p className="mt-1 text-xs text-gray-500">Business actions with the team member who did them.</p>
        {data.activity.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No activity recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {data.activity.map(item => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div>
                  <p className="text-sm text-charcoal">
                    <span className="font-semibold">{item.actor_name}</span>
                    <span className="text-gray-600"> — {actionLabel(item.action)}</span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {item.actor_email}
                    {item.actor_role ? ` · ${roleLabel(item.actor_role)}` : ''}
                  </p>
                </div>
                <time className="text-xs text-gray-400" dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
