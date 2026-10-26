import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const actorState = vi.hoisted(() => ({ actor: null as Record<string, unknown> | null }))
vi.mock('@/lib/audit-context', () => ({
  getAuditActor: vi.fn(async () => actorState.actor),
}))

import { logAudit } from '@/lib/audit'

beforeEach(() => {
  vi.clearAllMocks()
  actorState.actor = null
  db.merchant.findUnique.mockResolvedValue({ email: 'owner@example.com' })
  db.auditLog.create.mockResolvedValue({})
})

describe('audit actor attribution', () => {
  it('records which team member did the action', async () => {
    actorState.actor = { teamMemberId: 'tm1', name: 'Asha', email: 'asha@example.com', role: 'admin' }

    await logAudit({
      merchantId: 'm1',
      action: 'order_created',
      entityType: 'order',
      entityId: 'o1',
      metadata: { order_number: 'TP-1' },
    })

    const { data } = db.auditLog.create.mock.calls[0][0]
    expect(data).toMatchObject({
      merchantId: 'm1',
      email: 'asha@example.com',
      action: 'order_created',
      entityType: 'order',
      entityId: 'o1',
      metadata: {
        order_number: 'TP-1',
        actor: {
          team_member_id: 'tm1',
          name: 'Asha',
          email: 'asha@example.com',
          role: 'admin',
        },
      },
    })
  })

  it('an explicit actor wins over the request cookie', async () => {
    actorState.actor = { teamMemberId: 'tm1', name: 'Asha', email: 'asha@example.com', role: 'admin' }

    await logAudit({
      merchantId: 'm1',
      actor: { teamMemberId: 'tm2', name: 'Ravi', email: 'ravi@example.com', role: 'viewer' },
      action: 'team_member_joined',
      entityType: 'team_member',
      entityId: 'tm2',
    })

    const { data } = db.auditLog.create.mock.calls[0][0]
    expect(data.email).toBe('ravi@example.com')
    expect(data.metadata.actor).toMatchObject({ team_member_id: 'tm2', name: 'Ravi', role: 'viewer' })
  })

  it('keeps background jobs attributed to the merchant', async () => {
    await logAudit({
      merchantId: 'm1',
      action: 'payment_succeeded',
      entityType: 'payment',
      entityId: 'p1',
    })

    const { data } = db.auditLog.create.mock.calls[0][0]
    expect(data.email).toBe('owner@example.com')
    expect(data.metadata).toBeUndefined()
  })
})
