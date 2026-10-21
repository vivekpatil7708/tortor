import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { apiError } from '@/lib/api-response'
import { adminErrorResponse } from '@/lib/admin-api'
import { audienceSchema } from '@/lib/broadcast-audience'
import { broadcastContext, buildRecipientEmail } from '@/lib/broadcast'
import { resolveRecipients } from '@/lib/broadcast-campaign'
import { BROADCAST_VARIABLES, unsupportedVariables } from '@/lib/messaging'

const previewSchema = z.object({
  subject: z.string().trim().max(200).default(''),
  body: z.string().trim().max(5000).default(''),
  ctaLabel: z.string().trim().max(80).optional(),
  audience: audienceSchema.default({}),
})

/** How many recipients are shown in the preview. */
const SAMPLE_SIZE = 5

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const raw = await req.json().catch(() => null)
    const parsed = previewSchema.safeParse(raw)
    if (!parsed.success) return apiError(400, 'The preview could not be read')

    const { subject, body, ctaLabel, audience } = parsed.data

    const unsupported = unsupportedVariables(`${subject}\n${body}`, BROADCAST_VARIABLES)
    // Only a sample is needed to show what the message looks like, so the
    // audience is not loaded in full for every keystroke.
    const { recipients, paymentLinks, matched, suppressed, tooMany } = await resolveRecipients(audience, { max: 50 })

    const context = broadcastContext()
    const sample = recipients.slice(0, SAMPLE_SIZE).map(recipient => {
      const email = buildRecipientEmail(
        recipient,
        { subject, body, ctaLabel },
        context,
        { paymentLink: paymentLinks.get(recipient.id) ?? null }
      )
      return {
        email: recipient.email,
        business_name: recipient.businessName || recipient.email,
        subject: email.subject,
        body: email.body,
      }
    })

    return NextResponse.json({
      total: matched - suppressed,
      matched,
      suppressed,
      too_many: tooMany,
      unsupported_variables: unsupported,
      sample,
    })
  } catch (err: unknown) {
    return adminErrorResponse(err)
  }
}
