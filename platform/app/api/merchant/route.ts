import { NextRequest, NextResponse } from 'next/server'
import { getSession, merchantToJson, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publicErrorMessage } from '@/lib/api-response'
import { imageValueProblem } from '@/lib/image-input'
import { supportEmailInput, supportPhoneInput } from '@/lib/support-contact'
import { gstinStateCode, isValidGstin, isValidStateCode, isTaxScheme } from '@/lib/tax'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ merchant: merchantToJson(session) })
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()

    // Images are checked only when they change, so an older large logo doesn't
    // stop the merchant saving other branding settings.
    if (body.business_logo_url !== undefined || body.bg_image_url !== undefined) {
      const saved = await prisma.merchant.findUnique({
        where: { id: session.id },
        select: { businessLogoUrl: true, bgImageUrl: true },
      })
      const images = [
        ['Logo', body.business_logo_url, saved?.businessLogoUrl],
        ['Background image', body.bg_image_url, saved?.bgImageUrl],
      ] as const
      for (const [label, value, current] of images) {
        if (value === undefined || value === current) continue
        const problem = imageValueProblem(value)
        if (problem) return NextResponse.json({ error: `${label}: ${problem}` }, { status: 400 })
      }
    }

    const data: Record<string, unknown> = {}
    if (body.business_name !== undefined) data.businessName = String(body.business_name ?? '').trim().slice(0, 100)
    // Support contacts are shown to customers, so they must be a real email and phone (or empty).
    if (body.support_email !== undefined) {
      const email = supportEmailInput(body.support_email)
      if (!email.ok) return NextResponse.json({ error: email.error }, { status: 400 })
      data.supportEmail = email.value
    }
    if (body.support_phone !== undefined) {
      const phone = supportPhoneInput(body.support_phone)
      if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 400 })
      data.supportPhone = phone.value
    }
    if (body.business_logo_url !== undefined) data.businessLogoUrl = body.business_logo_url
    if (body.brand_color_primary !== undefined) data.brandColorPrimary = body.brand_color_primary
    if (body.brand_color_secondary !== undefined) data.brandColorSecondary = body.brand_color_secondary
    if (body.brand_font !== undefined) data.brandFont = body.brand_font
    if (body.button_style !== undefined) data.buttonStyle = body.button_style
    if (body.page_theme !== undefined) data.pageTheme = body.page_theme
    if (body.custom_domain !== undefined) data.customDomain = body.custom_domain
    if (body.bg_image_url !== undefined) data.bgImageUrl = body.bg_image_url

    // Tax details. A GSTIN is only accepted when it is structurally correct, and
    // its embedded state code must agree with the state the merchant picked -
    // the two disagreeing is a mistake that would surface on every future invoice.
    if (body.tax_scheme !== undefined) {
      const scheme = String(body.tax_scheme)
      if (!isTaxScheme(scheme)) return NextResponse.json({ error: 'Choose a valid tax scheme' }, { status: 400 })
      data.taxScheme = scheme
    }
    if (body.tax_legal_name !== undefined) {
      data.taxLegalName = String(body.tax_legal_name ?? '').trim().slice(0, 200) || null
    }
    if (body.state_code !== undefined) {
      const code = String(body.state_code ?? '').trim()
      if (code && !isValidStateCode(code)) return NextResponse.json({ error: 'Choose a valid state' }, { status: 400 })
      data.stateCode = code || null
    }
    if (body.gstin !== undefined) {
      const gstin = String(body.gstin ?? '').trim().toUpperCase()
      if (!gstin) {
        data.gstin = null
      } else if (!isValidGstin(gstin)) {
        return NextResponse.json({ error: 'That GSTIN is not valid. Check the 15 characters and the check digit.' }, { status: 400 })
      } else {
        // The chosen state is compared against the state code inside the GSTIN.
        // When the request does not carry a state, fall back to the saved one.
        const declared = body.state_code !== undefined
          ? String(body.state_code ?? '').trim()
          : (await prisma.merchant.findUnique({ where: { id: session.id }, select: { stateCode: true } }))?.stateCode ?? ''
        if (declared && declared !== gstinStateCode(gstin)) {
          return NextResponse.json({
            error: 'The state you chose does not match the state code inside the GSTIN.',
          }, { status: 400 })
        }
        data.gstin = gstin
      }
    }

    const merchant = await prisma.merchant.update({
      where: { id: session.id },
      data,
    })

    return NextResponse.json({ merchant: merchantToJson(merchant) })
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Update failed')
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
