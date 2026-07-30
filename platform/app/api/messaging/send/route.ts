import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderTemplate } from '@/lib/messaging'
import { renderOrderConfirmationEmail } from '@/lib/email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const fromAddress = process.env.RESEND_FROM || 'ToroPay <onboarding@resend.dev>'

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const { channel, recipient, subject, template, orderId, data } = await req.json()

    if (!channel || !recipient || !template) {
      return NextResponse.json({ error: 'channel, recipient, and template are required' }, { status: 400 })
    }

    const fillData: Record<string, string> = {
      merchant_name: session.businessName || session.email || 'Merchant',
      support_email: session.email || '',
      support_phone: session.phone || '',
      currency: 'INR',
      payment_link: orderId ? `https://toropay.co.in/pay/${orderId}` : '',
      ...data,
    }

    const renderedSubject = subject ? renderTemplate(subject, fillData) : ''
    const renderedBody = renderTemplate(template, fillData)

    let status = 'sent'
    let provider = 'manual'
    let providerMessageId: string | null = null
    let errorMessage: string | null = null

    if (channel === 'email' && resend) {
      provider = 'resend'
      try {
        const html = renderOrderConfirmationEmail({
          subject: renderedSubject,
          body: renderedBody,
          merchantName: session.businessName || 'Merchant',
        })
        const result = await resend.emails.send({
          from: fromAddress,
          to: recipient,
          subject: renderedSubject,
          html,
        })
        providerMessageId = result.data?.id || null
        status = 'sent'
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : 'Failed to send email'
      }
    } else if (channel === 'email' && !resend) {
      status = 'sent'
      provider = 'resend'
      errorMessage = 'Resend not configured - message logged without delivery'
    }

    const log = await prisma.messageLog.create({
      data: {
        merchantId: session.id,
        orderId: orderId || null,
        channel,
        recipient,
        subject: renderedSubject,
        renderedBody,
        status,
        provider,
        providerMessageId,
        errorMessage,
        createdBy: session.id,
      },
    })

    return NextResponse.json({ success: true, log })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
