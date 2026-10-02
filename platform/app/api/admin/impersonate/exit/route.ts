import { NextRequest, NextResponse } from 'next/server'
import { clearImpersonation, getImpersonation } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clientIp } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const impersonation = await getImpersonation()
  if (impersonation) {
    await prisma.auditLog
      .create({
        data: {
          merchantId: impersonation.merchantId,
          email: impersonation.adminEmail,
          action: 'admin_impersonation_ended',
          ipAddress: clientIp(req),
          userAgent: req.headers.get('user-agent'),
        },
      })
      .catch(() => {})
  }
  await clearImpersonation()
  return NextResponse.json({ success: true })
}
