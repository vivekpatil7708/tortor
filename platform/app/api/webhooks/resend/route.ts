import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { nextStatus } from '@/lib/message-status'
import {
  ResendEventAction,
  eventEmail,
  eventMessageId,
  resendEventAction,
  suppressionReason,
} from '@/lib/resend-events'

export const dynamic = 'force-dynamic'

// Built on first use, so importing this route never depends on the key being
// set. Checking a signature is a local calculation and makes no network call.
const resendClient = () => new Resend(process.env.RESEND_API_KEY || 'not-configured')

/**
 * The header Resend signs a webhook with. Both spellings are accepted: the
 * signature library uses "webhook-*", and Resend sends "svix-*".
 */
function signatureHeaders(req: NextRequest) {
  const header = (name: string) => req.headers.get(name) || ''
  return {
    id: header('svix-id') || header('webhook-id'),
    timestamp: header('svix-timestamp') || header('webhook-timestamp'),
    signature: header('svix-signature') || header('webhook-signature'),
  }
}

/** Puts an address on the list of addresses that must not be emailed again. */
async function suppress(email: string, reason: string, source: string) {
  // An event with no address cannot say which address to stop emailing.
  if (!email) return
  await prisma.emailSuppression
    .create({
      data: { email: email.toLowerCase(), reason, source },
    })
    .catch(() => {
      // The address is probably already on the list.
    })
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET is not set; the webhook cannot be checked')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  // The signature covers the exact bytes that were sent, so the body is read
  // once and never parsed before it is checked.
  const payload = await req.text()

  let event: { type: string; data?: Record<string, unknown> }
  try {
    event = resendClient().webhooks.verify({
      payload,
      headers: signatureHeaders(req),
      webhookSecret: secret,
    }) as unknown as typeof event
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const action = resendEventAction(event)
  if (action.kind === 'ignored') return NextResponse.json({ received: true })

  const providerMessageId = eventMessageId(event)
  const email = eventEmail(event)
  if (!providerMessageId && !email) return NextResponse.json({ received: true })

  const message = await prisma.messageLog.findFirst({
    where: providerMessageId
      ? { providerMessageId }
      : { recipient: { equals: email!, mode: 'insensitive' } },
    select: { id: true, status: true, recipient: true },
  })

  // An event about a message this app did not send is not our business.
  if (!message) return NextResponse.json({ received: true })

  await applyAction(action, message, email)

  return NextResponse.json({ received: true })
}

async function applyAction(
  action: ResendEventAction,
  message: { id: string; status: string; recipient: string },
  email: string | null
) {
  if (action.kind === 'delivered' || action.kind === 'opened') {
    const delivered = action.kind === 'delivered'
    await prisma.messageLog.update({
      where: { id: message.id },
      data: {
        status: nextStatus(message.status, delivered ? 'delivered' : 'read'),
        ...(delivered ? { deliveredAt: new Date() } : {}),
        ...(action.kind === 'opened' ? { readAt: new Date() } : {}),
      },
    })
    return
  }

  if (action.kind === 'bounced' || action.kind === 'complained') {
    await prisma.messageLog.update({
      where: { id: message.id },
      data: {
        status: nextStatus(message.status, 'failed'),
        errorMessage: action.reason,
      },
    })
    const reason = suppressionReason(action)
    if (reason) await suppress(message.recipient || email || '', reason, 'resend')
    return
  }

  if (action.kind === 'failed') {
    await prisma.messageLog.update({
      where: { id: message.id },
      data: {
        status: nextStatus(message.status, 'failed'),
        errorMessage: action.reason,
      },
    })
  }
}
