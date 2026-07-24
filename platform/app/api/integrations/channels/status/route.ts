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
          status: hasTwilioKey ? 'available' : 'coming_soon',
          provider: 'WhatsApp',
          description: hasTwilioKey ? 'WhatsApp Business API configured and ready.' : 'Coming soon — WhatsApp message sending will be available soon.',
          setup_help: 'Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable WhatsApp messaging.',
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
