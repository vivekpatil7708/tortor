import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMerchant } from '@/lib/tenant'
import { testCourierConnection, deleteCourierConnection, setCourierConnectionActive, serializeCourierConnectionWithSecret, getSupportedCourierInfo, serializeSupportedCourier } from '@/lib/couriers/connections'
import { courierConnectionSchema } from '@/lib/validators'
import { saveCourierConnection } from '@/lib/couriers/connections'
import { notFound, badRequest, handleError } from '@/lib/api-response'
import { zodMessage } from '@/lib/zod-error'

// GET /api/courier/connections/[provider] — one connection incl. webhook secret
export async function GET(_req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const session = await requireMerchant()
    const connection = await prisma.courierConnection.findUnique({
      where: { merchantId_provider: { merchantId: session.id, provider: params.provider } },
    })
    if (!connection) return notFound('Connection not found')
    const [serialized, info] = await Promise.all([
      serializeCourierConnectionWithSecret(connection),
      Promise.resolve(getSupportedCourierInfo(params.provider)),
    ])
    return NextResponse.json({ connection: serialized, supported_courier: info ? serializeSupportedCourier(info) : null })
  } catch (err) {
    return handleError(err)
  }
}

// PATCH /api/courier/connections/[provider]
// body: { action: 'test' } | { active: boolean } | courierConnectionSchema fields
export async function PATCH(req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const session = await requireMerchant()
    const body = await req.json()

    const existing = await prisma.courierConnection.findUnique({
      where: { merchantId_provider: { merchantId: session.id, provider: params.provider } },
    })
    if (!existing) return notFound('Connection not found')

    if (body.action === 'test') {
      const result = await testCourierConnection(existing.id)
      return NextResponse.json(result)
    }

    if (typeof body.active === 'boolean') {
      await setCourierConnectionActive(session.id, params.provider, body.active)
      const fresh = await prisma.courierConnection.findUnique({
        where: { merchantId_provider: { merchantId: session.id, provider: params.provider } },
      })
      return NextResponse.json({ connection: fresh ? serializeCourierConnectionWithSecret(fresh) : null })
    }

    const parsed = courierConnectionSchema.parse(body)
    const updated = await saveCourierConnection({
      merchantId: session.id,
      provider: params.provider,
      label: parsed.label,
      testMode: parsed.test_mode,
      credentials: parsed.credentials ?? null,
    })
    return NextResponse.json({ connection: serializeCourierConnectionWithSecret(updated) })
  } catch (err) {
    const msg = zodMessage(err)
    if (msg) return badRequest(msg)
    return handleError(err)
  }
}

// DELETE /api/courier/connections/[provider]
export async function DELETE(_req: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const session = await requireMerchant()
    await deleteCourierConnection(session.id, params.provider)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}