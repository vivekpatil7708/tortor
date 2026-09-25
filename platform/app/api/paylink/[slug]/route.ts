import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutFromLink } from '@/lib/payment-link'
import { apiError } from '@/lib/api-response'

export async function POST(req: NextRequest, ctx: { params: { slug: string } }) {
  const body = (await req.json().catch(() => null)) as { name?: string; email?: string; phone?: string; amount?: number } | null

  const result = await createCheckoutFromLink(ctx.params.slug, {
    customer: body ? { name: body.name ?? null, email: body.email ?? null, phone: body.phone ?? null } : null,
    amount: body?.amount ?? null,
  })

  if ('error' in result) return apiError(400, result.error)
  return NextResponse.json(result, { status: 201 })
}