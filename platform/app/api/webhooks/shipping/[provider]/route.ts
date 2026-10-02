import { NextRequest, NextResponse } from 'next/server'
import { processCourierWebhook } from '@/lib/couriers/webhook'
import { handleError } from '@/lib/api-response'

const SIGNATURE_HEADERS: Record<string, string[]> = {
  mock: ['x-courier-signature', 'x-webhook-signature', 'x-toropay-signature'],
  shiprocket: ['x-shiprocket-signature', 'x-webhook-signature'],
  delhivery: ['x-dlh-signature', 'x-webhook-signature'],
}

// POST /api/webhooks/shipping/[provider]
// Inbound courier tracking webhook. We always ACK 200 after processing so the
// courier never retries events we have already persisted.
export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const provider = params.provider
    const rawBody = await req.text()
    const headers = SIGNATURE_HEADERS[provider] ?? SIGNATURE_HEADERS.mock
    let signature: string | null = null
    for (const h of headers) {
      const v = req.headers.get(h)
      if (v) {
        signature = v
        break
      }
    }

    const result = await processCourierWebhook({ provider, rawBody, signature })

    return NextResponse.json({
      received: true,
      event_id: result.eventId,
      signature_valid: result.signatureValid,
      duplicate: result.duplicate,
      applied: result.applied,
      changed: result.changed,
      out_of_order: result.outOfOrder,
      error: result.error ?? null,
    })
  } catch (err) {
    return handleError(err)
  }
}

// GET /api/webhooks/shipping/[provider] — quick health/liveness probe used by couriers.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'courier-webhooks' })
}