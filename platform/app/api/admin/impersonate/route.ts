import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { clearImpersonation, createImpersonationSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { merchantId } = await req.json()
    if (!merchantId) {
      return NextResponse.json({ error: 'merchantId required' }, { status: 400 })
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })
    if (merchant.status === 'suspended') {
      return NextResponse.json({ error: 'Merchant is suspended' }, { status: 403 })
    }

    await clearImpersonation()
    await createImpersonationSession(merchant.id, admin.email)
    return NextResponse.json({ success: true, merchant_email: merchant.email })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 })
  }
}