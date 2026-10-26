/**
 * Team roles. Kept free of server imports so the dashboard can use the same
 * labels and permission rules as the API.
 */
export const TEAM_ROLES = ['owner', 'admin', 'viewer'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value)
}

/** Missing roles are old owner sessions, which keep full access. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role == null || role === 'owner'
}

/** Viewers can read everything but change nothing. */
export function canWrite(role: string | null | undefined): boolean {
  return role !== 'viewer'
}

/** Team membership and account/security settings belong to the owner. */
export function canManageTeam(role: string | null | undefined): boolean {
  return isOwnerRole(role)
}

/** Billing does not exist yet; when it does, admins must not manage it. */
export function canManageBilling(role: string | null | undefined): boolean {
  return isOwnerRole(role)
}

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  viewer: 'Viewer',
}

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: 'Full access, including team, account settings and billing.',
  admin: 'Manage payments, orders, products and customers. No team, account security or billing.',
  viewer: 'Read-only access to the dashboard.',
}
