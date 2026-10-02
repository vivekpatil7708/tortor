import { NextRequest, NextResponse } from 'next/server'
import { requireMerchant } from '@/lib/tenant'
import { courierConnectionSchema } from '@/lib/validators'
import { saveCourierConnection, listCourierConnections, getSupportedCouriers, setCourierConnectionActive, serializeSupportedCourier } from '@/lib/couriers/connections'
import { badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

// GET /api/courier/connections — merchant's courier connections + supported providers
export async function GET() {
  try {
    const session = await requireMerchant()
    const [connections, supported] = await Promise.all([
      listCourierConnections(session.id),
      Promise.resolve(getSupportedCouriers().map(serializeSupportedCourier)),
    ])
    return NextResponse.json({ connections, supported_couriers: supported })
  } catch (err) {
    return handleError(err)
  }
}

// POST /api/courier/connections — save (create or update) a courier connection
export async function POST(req: NextRequest) {
  try {
    const session = await requireMerchant()
    const body = courierConnectionSchema.parse(await req.json())

    const connection = await saveCourierConnection({
      merchantId: session.id,
      provider: body.provider,
      label: body.label,
      testMode: body.test_mode,
      credentials: body.credentials ?? null,
    })

    if (body.active) {
      await setCourierConnectionActive(session.id, body.provider, true)
    }

    const [fresh, supported] = await Promise.all([
      listCourierConnections(session.id),
      Promise.resolve(getSupportedCouriers().map(serializeSupportedCourier)),
    ])
    return NextResponse.json({ connection: fresh.find(c => c.provider === body.provider) ?? null, connections: fresh, supported_couriers: supported })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    const custom = err instanceof Error ? err.message : null
    if (custom && !custom.startsWith('Mock')) return badRequest(custom)
    return handleError(err)
  }
}