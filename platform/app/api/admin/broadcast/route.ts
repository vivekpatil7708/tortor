import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { renderTemplate } from '@/lib/messaging'
import { renderBroadcastEmail } from '@/lib/email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const fromAddress = process.env.RESEND_FROM || 'ToroPay <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.toropay.co.in'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 20, 100)
    const logs = await prisma.messageLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { merchant: { select: { businessName: true, email: true } } },
    })
    return NextResponse.json({
      logs: logs.map(l => ({
        merchant_name: l.merchant?.businessName || l.merchant?.email || 'Unknown',
        email: l.recipient,
        status: l.status,
        subject: l.subject,
        created_at: l.createdAt.toISOString(),
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { subject, body, merchantIds } = await req.json()

    if (!subject || !body) {
      return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
    }
    if (!resend) {
      return NextResponse.json({ error: 'Resend is not configured' }, { status: 503 })
    }

    const targetIds = Array.isArray(merchantIds) && merchantIds.length > 0
      ? merchantIds.filter((id: unknown): id is string => typeof id === 'string')
      : null

    const merchants = await prisma.merchant.findMany({
      where: {
        status: 'active',
        ...(targetIds ? { id: { in: targetIds } } : {}),
      },
      select: { id: true, email: true, businessName: true, phone: true },
    })

    const paymentLinks = await prisma.paymentLink.findMany({
      where: { merchantId: { in: merchants.map(m => m.id) }, status: 'active' },
      select: { merchantId: true, slug: true },
    })
    const paymentLinkMap = new Map<string, string>()
    paymentLinks.forEach(pl => {
      if (!paymentLinkMap.has(pl.merchantId)) paymentLinkMap.set(pl.merchantId, `${APP_URL}/pay/${pl.slug}`)
    })

    let sent = 0
    let failed = 0

    for (const merchant of merchants) {
      const fillData: Record<string, string> = {
        merchant_name: merchant.businessName || merchant.email || 'Merchant',
        payment_link: paymentLinkMap.get(merchant.id) || `${APP_URL}`,
        feedback_form_link: `${APP_URL}/feedback`,
        support_email: process.env.ADMIN_EMAIL || 'support@toropay.co.in',
        support_phone: merchant.phone || '',
        currency: 'INR',
      }

      const renderedSubject = renderTemplate(subject, fillData)
      const renderedBody = renderTemplate(body, fillData)
      const html = renderBroadcastEmail({ subject: renderedSubject, body: renderedBody, ctaUrl: fillData.feedback_form_link })

      let status = 'sent'
      let providerMessageId: string | null = null
      let errorMessage: string | null = null

      try {
        const result = await resend.emails.send({
          from: fromAddress,
          to: merchant.email,
          subject: renderedSubject,
          html,
          text: renderedBody,
        })
        providerMessageId = result.data?.id || null
        status = 'sent'
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : 'Failed to send email'
      }

      await prisma.messageLog.create({
        data: {
          merchantId: merchant.id,
          channel: 'email',
          recipient: merchant.email,
          subject: renderedSubject,
          renderedBody,
          status,
          provider: 'resend',
          providerMessageId,
          errorMessage,
          createdBy: process.env.ADMIN_EMAIL || 'admin',
        },
      })

      if (status === 'sent') sent += 1
      else failed += 1

      await sleep(1100)
    }

    return NextResponse.json({ success: true, total: merchants.length, sent, failed })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 })
  }
}