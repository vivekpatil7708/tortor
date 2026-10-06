import { NextRequest, NextResponse } from 'next/server'
import { getCheckoutView } from '@/lib/checkout'
import { notFound } from '@/lib/api-response'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ session: string }> }) {
  const view = await getCheckoutView((await ctx.params).session)
  if (!view) return notFound('Checkout not found or expired')
  return NextResponse.json(view)
}