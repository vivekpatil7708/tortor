import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  teamMember: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  merchant: { update: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const auth = vi.hoisted(() => ({ requireMerchant: vi.fn() }))
vi.mock('@/lib/tenant', () => auth)

const session = vi.hoisted(() => ({ createSession: vi.fn() }))
vi.mock('@/lib/auth', () => session)

const mail = vi.hoisted(() => ({
  sendTeamInviteEmail: vi.fn(
    async (_params: { to: string; businessName: string; inviterName: string; role: string; token: string }) => true
  ),
}))
vi.mock('@/lib/team-invite', () => mail)

const audit = vi.hoisted(() => ({ logAudit: vi.fn() }))
vi.mock('@/lib/audit', () => audit)

import { POST as invite } from '@/app/api/team/invite/route'
import { POST as accept } from '@/app/api/team/accept/route'
import { hashInviteToken } from '@/lib/team-token'

const ownerSession = {
  id: 'm1',
  accountId: 'a1',
  accountEmail: 'owner@example.com',
  accountName: 'Owner',
  email: 'owner@example.com',
  businessName: 'Asha Crafts',
  teamRole: 'owner',
  teamMemberId: 'tm-owner',
  teamMemberName: 'Owner',
  emailVerifiedAt: new Date(),
  isTeamMember: false,
}

const memberRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'tm1',
  merchantId: 'm1',
  accountId: null,
  email: 'asha@example.com',
  name: null,
  role: 'admin',
  invitedAt: new Date('2026-10-26T10:00:00Z'),
  invitedBy: 'tm-owner',
  acceptedAt: null,
  inviteToken: 'hashed',
  inviteExpiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date('2026-10-26T10:00:00Z'),
  updatedAt: new Date('2026-10-26T10:00:00Z'),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.requireMerchant.mockResolvedValue(ownerSession)
  mail.sendTeamInviteEmail.mockResolvedValue(true)
})

describe('POST /api/team/invite', () => {
  it('creates a pending invite and emails only a hashed token to the database', async () => {
    db.teamMember.findFirst.mockResolvedValue(null)
    db.teamMember.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => memberRow(data))

    const res = await invite(
      new NextRequest('http://localhost/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'Asha@Example.com', role: 'admin' }),
      })
    )

    expect(res.status).toBe(201)
    const { data } = db.teamMember.create.mock.calls[0][0]
    expect(data.email).toBe('asha@example.com')
    expect(data.role).toBe('admin')
    expect(data.inviteToken).toMatch(/^[0-9a-f]{64}$/)

    const emailedToken = mail.sendTeamInviteEmail.mock.calls[0][0].token as string
    expect(data.inviteToken).toBe(hashInviteToken(emailedToken))
    expect(data.inviteToken).not.toBe(emailedToken)
  })

  it('does not let an admin invite people', async () => {
    auth.requireMerchant.mockResolvedValue({ ...ownerSession, teamRole: 'admin' })
    const res = await invite(
      new NextRequest('http://localhost/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'asha@example.com', role: 'viewer' }),
      })
    )
    expect(res.status).toBe(403)
    expect(db.teamMember.create).not.toHaveBeenCalled()
  })

  it('rejects the owner inviting their own login', async () => {
    const res = await invite(
      new NextRequest('http://localhost/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'OWNER@example.com', role: 'viewer' }),
      })
    )
    expect(res.status).toBe(400)
    expect(mail.sendTeamInviteEmail).not.toHaveBeenCalled()
  })
})

describe('POST /api/team/accept', () => {
  it('links the signed-in account, clears the invite and switches the session', async () => {
    const inviteRow = memberRow({ inviteToken: hashInviteToken('raw-token') })
    db.teamMember.findUnique.mockResolvedValue({
      ...inviteRow,
      merchant: { id: 'm1', businessName: 'Asha Crafts', name: 'Asha', email: 'owner@example.com' },
    })
    db.teamMember.findFirst.mockResolvedValue(null)
    db.teamMember.update.mockResolvedValue({ ...inviteRow, accountId: 'a2', acceptedAt: new Date(), inviteToken: null, inviteExpiresAt: null })

    auth.requireMerchant.mockResolvedValue({
      ...ownerSession,
      id: 'a2',
      accountId: 'a2',
      accountEmail: 'asha@example.com',
      accountName: 'Asha',
      email: 'asha@example.com',
      teamRole: 'owner',
      teamMemberId: null,
      isTeamMember: false,
    })

    const res = await accept(
      new NextRequest('http://localhost/api/team/accept', {
        method: 'POST',
        body: JSON.stringify({ token: 'raw-token' }),
      })
    )

    expect(res.status).toBe(200)
    expect(db.teamMember.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tm1' },
      data: expect.objectContaining({
        accountId: 'a2',
        inviteToken: null,
        inviteExpiresAt: null,
      }),
    }))
    expect(session.createSession).toHaveBeenCalledWith(
      'a2',
      'asha@example.com',
      expect.objectContaining({
        team: expect.objectContaining({ merchantId: 'm1', teamMemberId: 'tm1', role: 'admin' }),
      })
    )
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'm1',
      action: 'team_member_joined',
    }))
  })

  it('refuses an invitation sent to another email address', async () => {
    db.teamMember.findUnique.mockResolvedValue({
      ...memberRow({ inviteToken: hashInviteToken('raw-token') }),
      merchant: { id: 'm1', businessName: 'Asha Crafts', name: 'Asha', email: 'owner@example.com' },
    })
    const res = await accept(
      new NextRequest('http://localhost/api/team/accept', {
        method: 'POST',
        body: JSON.stringify({ token: 'raw-token' }),
      })
    )
    expect(res.status).toBe(403)
    expect(db.teamMember.update).not.toHaveBeenCalled()
  })
})
