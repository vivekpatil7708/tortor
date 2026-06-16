import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()

    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        merchant: { select: { email: true, businessName: true } },
      },
    })

    return NextResponse.json({
      transactions: transactions.map(t => ({
        txn_id: t.txnId,
        amount: t.amount,
        status: t.status,
        customer_name: t.customerName,
        customer_phone: t.customerPhone,
        merchant_email: t.merchant.email,
        merchant_business: t.merchant.businessName,
        created_at: t.createdAt.toISOString(),
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 })
  }
}
