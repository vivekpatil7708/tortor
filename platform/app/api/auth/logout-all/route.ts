import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, endAllSessions, getSession } from '@/lib/auth'

/** Signs the account out on every other device; this device gets a fresh login. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await endAllSessions(session.id)
  await createSession(session.id, session.email)

  await prisma.auditLog.create({
    data: {
      merchantId: session.id,
      email: session.email,
      action: 'logout_other_devices',
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
      userAgent: req.headers.get('user-agent'),
    },
  })

  return NextResponse.json({ success: true })
}
