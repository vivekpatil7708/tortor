import { NextRequest, NextResponse } from 'next/server'
import { getSession, merchantToJson, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ merchant: merchantToJson(session) })
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()

    const data: Record<string, unknown> = {}
    if (body.business_name !== undefined) data.businessName = body.business_name
    if (body.business_logo_url !== undefined) data.businessLogoUrl = body.business_logo_url
    if (body.brand_color_primary !== undefined) data.brandColorPrimary = body.brand_color_primary
    if (body.brand_color_secondary !== undefined) data.brandColorSecondary = body.brand_color_secondary
    if (body.brand_font !== undefined) data.brandFont = body.brand_font
    if (body.button_style !== undefined) data.buttonStyle = body.button_style
    if (body.page_theme !== undefined) data.pageTheme = body.page_theme
    if (body.custom_domain !== undefined) data.customDomain = body.custom_domain

    const merchant = await prisma.merchant.update({
      where: { id: session.id },
      data,
    })

    return NextResponse.json({ merchant: merchantToJson(merchant) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
