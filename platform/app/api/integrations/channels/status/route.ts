import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'

export async function GET() {
  try {
    await requireSession()
    const hasResendKey = !!process.env.RESEND_API_KEY
    const hasTwilioKey = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN

    return NextResponse.json({
      channels: {
        email: {
          status: hasResendKey ? 'available' : 'unavailable',
          provider: 'Resend',
          description: hasResendKey ? 'Ready to send transactional emails.' : 'Set RESEND_API_KEY to enable.',
          setup_help: 'Add RESEND_API_KEY to your environment variables.',
        },
        whatsapp: {
          status: hasTwilioKey ? 'available' : 'unavailable',
          provider: 'Twilio / Meta WhatsApp Cloud API',
          description: hasTwilioKey ? 'WhatsApp Business API configured.' : 'Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable.',
          setup_help: 'Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable WhatsApp messaging.',
        },
        instagram: {
          status: 'limited',
          provider: 'Meta Instagram Messaging API',
          description: 'Instagram does not support free-form outbound messaging. Requires a connected eligible Instagram Business account with appropriate API permissions.',
          fallback_actions: ['preview', 'copy_message', 'open_instagram', 'mark_as_contacted'],
          setup_help: 'Connect your Instagram Business account via Meta Developer Console and enable the Messaging API.',
        },
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
