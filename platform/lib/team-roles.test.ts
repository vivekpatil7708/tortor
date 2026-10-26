import { describe, expect, it } from 'vitest'
import {
  TEAM_ROLES,
  canManageBilling,
  canManageTeam,
  canWrite,
  isOwnerRole,
  isTeamRole,
} from '@/lib/team-roles'

describe('team roles', () => {
  it('recognises only the three supported roles', () => {
    expect(TEAM_ROLES).toEqual(['owner', 'admin', 'viewer'])
    expect(isTeamRole('owner')).toBe(true)
    expect(isTeamRole('admin')).toBe(true)
    expect(isTeamRole('viewer')).toBe(true)
    expect(isTeamRole('staff')).toBe(false)
    expect(isTeamRole(null)).toBe(false)
  })

  it('lets owners and admins write, but not viewers', () => {
    expect(canWrite('owner')).toBe(true)
    expect(canWrite('admin')).toBe(true)
    expect(canWrite('viewer')).toBe(false)
  })

  it('keeps team and billing management with the owner', () => {
    expect(canManageTeam('owner')).toBe(true)
    expect(canManageTeam('admin')).toBe(false)
    expect(canManageTeam('viewer')).toBe(false)
    expect(canManageBilling('owner')).toBe(true)
    expect(canManageBilling('admin')).toBe(false)
  })

  it('treats sessions from before team access as owner sessions', () => {
    expect(isOwnerRole(undefined)).toBe(true)
    expect(isOwnerRole(null)).toBe(true)
    expect(isOwnerRole('owner')).toBe(true)
    expect(isOwnerRole('admin')).toBe(false)
  })
})
