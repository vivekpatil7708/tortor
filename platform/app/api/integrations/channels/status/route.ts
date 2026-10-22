import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { isOpenWaConfigured } from '@/lib/messaging/openwa'
import { isWhatsAppEnabledFor, whatsAppChannelDescription } from '@/lib/messaging/whatsapp-access'

export async function GET() {
  try {
    const session = await requireSession()
    const hasResendKey = !!process.env.RESEND_API_KEY

    // WhatsApp is sent through a self-hosted OpenWA gateway, so the channel is
    // "available" only when that gateway is configured AND this merchant is on
    // the early-access allowlist. The badge and the send route share the same
    // check, so what a merchant is shown matches what they can do.
    const whatsappConfigured = isOpenWaConfigured()
    const whatsappEnabled = isWhatsAppEnabledFor(session.email)

    return NextResponse.json({
      channels: {
        email: {
          status: hasResendKey ? 'available' : 'unavailable',
          provider: 'Resend',
          description: hasResendKey ? 'Ready to send transactional emails.' : 'Set RESEND_API_KEY to enable.',
          setup_help: 'Add RESEND_API_KEY to your environment variables.',
        },
        whatsapp: {
          status: whatsappConfigured && whatsappEnabled ? 'available' : 'coming_soon',
          provider: 'WhatsApp',
          description: whatsAppChannelDescription(whatsappEnabled, whatsappConfigured),
          setup_help: whatsappEnabled
            ? 'WhatsApp messaging is ready to use.'
            : 'WhatsApp messaging is being rolled out gradually. Contact support if you need it enabled.',
        },
        instagram: {
          status: 'coming_soon',
          provider: 'Instagram',
          description: 'Coming soon — Instagram message sending will be available soon. Till then you can preview, copy, or manually follow up.',
          fallback_actions: ['preview', 'copy_message', 'open_instagram', 'mark_as_contacted'],
          setup_help: 'Instagram Messaging API requires a connected eligible Instagram Business account.',
        },
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
