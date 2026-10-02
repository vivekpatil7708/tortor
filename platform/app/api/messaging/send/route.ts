import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderTemplate } from '@/lib/messaging'
import { renderOrderConfirmationEmail } from '@/lib/email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const fromAddress = process.env.RESEND_FROM || 'ToroPay <onboarding@resend.dev>'
const MAX_EMAILS_PER_DAY = 100

const digits = (value: string) => value.replace(/\D/g, '')

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { channel, recipient, subject, template, orderId, data } = await req.json()

    if (!channel || !recipient || !template || !orderId) {
      return NextResponse.json({ error: 'channel, recipient, template and orderId are required' }, { status: 400 })
    }

    // Messages only go to the customer of one of this merchant's own orders.
    const order = await prisma.transaction.findFirst({
      where: { txnId: String(orderId), merchantId: session.id },
      select: { customerEmail: true, customerPhone: true },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const to = String(recipient).trim()
    const isCustomerEmail = Boolean(order.customerEmail) && to.toLowerCase() === order.customerEmail!.trim().toLowerCase()
    const isCustomerPhone = Boolean(order.customerPhone) && digits(to) !== '' && digits(to) === digits(order.customerPhone!)
    if (channel === 'email' ? !isCustomerEmail : !(isCustomerEmail || isCustomerPhone)) {
      return NextResponse.json({ error: "Messages can only be sent to this order's customer" }, { status: 400 })
    }

    if (channel === 'email') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const sentToday = await prisma.messageLog.count({
        where: { merchantId: session.id, channel: 'email', createdAt: { gte: since } },
      })
      if (sentToday >= MAX_EMAILS_PER_DAY) {
        return NextResponse.json({ error: `Daily email limit reached (${MAX_EMAILS_PER_DAY}). Please try again tomorrow.` }, { status: 429 })
      }
    }

    // Values from the browser may customise the message but never blank out the defaults.
    const overrides = Object.fromEntries(
      Object.entries((data ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    ) as Record<string, string>
    const fillData: Record<string, string> = {
      merchant_name: session.businessName || session.email || 'Merchant',
      support_email: session.email || '',
      support_phone: session.phone || '',
      currency: 'INR',
      payment_link: `https://www.toropay.co.in/pay/${orderId}`,
      ...overrides,
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
          to,
          subject: renderedSubject,
          html,
        })
        if (result.error) {
          status = 'failed'
          errorMessage = result.error.message
        } else {
          providerMessageId = result.data?.id || null
        }
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : 'Failed to send email'
      }
    } else if (channel === 'email') {
      status = 'failed'
      provider = 'resend'
      errorMessage = 'Email sending is not set up'
    }

    const log = await prisma.messageLog.create({
      data: {
        merchantId: session.id,
        orderId: String(orderId),
        channel,
        recipient: to,
        subject: renderedSubject,
        renderedBody,
        status,
        provider,
        providerMessageId,
        errorMessage,
        createdBy: session.id,
      },
    })

    if (status === 'failed') {
      return NextResponse.json({ error: 'The email could not be sent. Please try again later.', log }, { status: 502 })
    }
    return NextResponse.json({ success: true, log })
  } catch (err) {
    console.error('Send message failed:', err)
    return NextResponse.json({ error: 'Could not send the message' }, { status: 500 })
  }
}
