import { getSession } from './auth'

export async function requireAdmin() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || session.email !== adminEmail) throw new Error('Forbidden')
  return session
}
