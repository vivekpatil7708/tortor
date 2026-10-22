import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireSession } from '@/lib/auth'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { prisma } from '@/lib/prisma'
import { renderMessage, renderTemplate } from '@/lib/messaging'
import { renderOrderConfirmationEmail } from '@/lib/email'
import { getMessagingProvider, type MessagingProvider } from '@/lib/messaging/provider'
import { isOpenWaConfigured } from '@/lib/messaging/openwa'
import { isWhatsAppEnabledFor } from '@/lib/messaging/whatsapp-access'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const fromAddress = process.env.RESEND_FROM || 'ToroPay <onboarding@resend.dev>'
const MAX_EMAILS_PER_DAY = 100

const digits = (value: string) => value.replace(/\D/g, '')

/**
 * The WhatsApp provider to send through, or null when none is configured.
 *
 * Deliberately does not fall back to the mock provider: recording a mock
 * "sent" against a merchant's real order would claim a delivery that never
 * happened, which is the bug this path exists to avoid.
 *
 * This route sends through the self-hosted OpenWA gateway (OPENWA_* env). A
 * merchant's own Meta credentials live encrypted on ChannelConnection and are
 * not read here; when OpenWA is unset the send is refused rather than silently
 * routed somewhere the operator did not configure.
 */
function whatsAppProvider(): MessagingProvider | null {
  if (!isOpenWaConfigured()) return null
  return getMessagingProvider('whatsapp')
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!session.emailVerifiedAt) {
    return NextResponse.json({ error: EMAIL_NOT_VERIFIED }, { status: 403 })
  }

  try {
    const { channel, recipient, subject, template, orderId, data } = await req.json()

    if (!channel || !recipient || !template || !orderId) {
      return NextResponse.json({ error: 'channel, recipient, template and orderId are required' }, { status: 400 })
    }

    // Messages only go to the customer of one of this merchant's own orders.
    const order = await prisma.transaction.findFirst({
      where: { txnId: String(orderId), merchantId: session.id },
      select: { customerEmail: true, customerPhone: true, paymentLink: { select: { slug: true } } },
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

    // Instagram has no provider wired up, and nothing here would send anything -
    // so refuse before writing a log row, rather than recording a message as
    // 'sent' that never left. WhatsApp has a real provider (OpenWA or Meta) and
    // is handled below; it must still fail loudly when that provider is absent.
    if (channel !== 'email' && channel !== 'whatsapp') {
      const label = channel === 'instagram' ? 'Instagram' : String(channel)
      return NextResponse.json(
        { error: `${label} sending is not available yet. This message was not sent. Copy it and send it yourself for now.` },
        { status: 501 },
      )
    }

    // Values from the browser may customise the message but never blank out the defaults.
    const overrides = Object.fromEntries(
      Object.entries((data ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    ) as Record<string, string>
    // The payment link is set from the order AFTER the browser's values, because
    // it decides where the customer's money is asked for. Letting the browser
    // choose it would let a message point at any URL at all.
    delete overrides.payment_link
    // `/pay/<slug>` resolves the payment link by its slug, so a link built from
    // the order's txn id can never work - it lands on "This payment link doesn't
    // exist". Orders created without a payment link have no URL to offer at all,
    // so the link is left out rather than pointing somewhere broken.
    const orderSlug = order.paymentLink?.slug
    const fillData: Record<string, string> = {
      merchant_name: session.businessName || session.email || 'Merchant',
      support_email: session.email || '',
      support_phone: session.phone || '',
      currency: 'INR',
      ...overrides,
      ...(orderSlug ? { payment_link: `https://www.toropay.co.in/pay/${orderSlug}` } : {}),
    }

    const renderedSubject = subject ? renderTemplate(subject, fillData) : ''
    // The body drops lines left empty by a variable we had no value for, so a
    // missing payment link does not reach the customer as a bare placeholder.
    const renderedBody = renderMessage(template, fillData)

    let status = 'sent'
    let provider = 'manual'
    let providerMessageId: string | null = null
    let errorMessage: string | null = null

    if (channel === 'whatsapp') {
      // Early access: only allowlisted accounts may send WhatsApp, so a bad send
      // affects a tester rather than every merchant's customers. Checked before
      // the provider so a merchant who is not on the list gets a clear "not for
      // you yet" rather than a confusing note about server configuration.
      if (!isWhatsAppEnabledFor(session.email)) {
        return NextResponse.json(
          { error: 'WhatsApp not available for your account yet' },
          { status: 501 },
        )
      }
      const wa = whatsAppProvider()
      if (!wa) {
        return NextResponse.json(
          { error: 'WhatsApp sending is not set up. This message was not sent.' },
          { status: 503 },
        )
      }
      // WhatsApp goes through the provider abstraction. Its sendMessage returns
      // ok: false on any failure, so we never log a message as sent that never
      // left.
      const result = await wa.sendMessage({
        to,
        body: renderedBody,
        metadata: { orderId: String(orderId), merchantId: session.id },
      })
      provider = wa.name
      if (result.ok) {
        providerMessageId = result.providerMessageId
      } else {
        status = 'failed'
        // Kept as the provider reported it. Left empty rather than filled with a
        // placeholder, so the response can say nothing useful instead of
        // something vague like "WhatsApp send failed".
        errorMessage = result.error || null
      }
    } else if (resend) {
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
    } else {
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
      const label = channel === 'whatsapp' ? 'WhatsApp' : 'email'
      // The provider's own reason is deliberately included: without it the
      // merchant only sees "could not be sent" and has no way to tell a wrong
      // number from a gateway that is down, which makes support impossible.
      return NextResponse.json(
        {
          error: errorMessage
            ? `The ${label} message could not be sent: ${errorMessage}`
            : `The ${label} message could not be sent. Please try again later.`,
          log,
        },
        { status: 502 },
      )
    }
    return NextResponse.json({ success: true, log })
  } catch (err) {
    console.error('Send message failed:', err)
    return NextResponse.json({ error: 'Could not send the message' }, { status: 500 })
  }
}
