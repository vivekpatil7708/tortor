import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderTemplate } from '@/lib/messaging'

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

    const log = await prisma.messageLog.create({
      data: {
        merchantId: session.id,
        orderId: orderId || null,
        channel,
        recipient,
        subject: renderedSubject,
        renderedBody,
        status: 'sent',
        provider: channel === 'email' ? 'resend' : channel === 'whatsapp' ? 'twilio' : 'manual',
        providerMessageId: null,
        createdBy: session.id,
      },
    })

    return NextResponse.json({ success: true, log })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
