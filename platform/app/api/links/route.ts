import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { EMAIL_NOT_VERIFIED } from '@/lib/email-verification'
import { linkLimitsInput } from '@/lib/link-limits'
import { linkAmountInput } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { serializeLink } from '@/lib/serializers'
import { generateSlug } from '@/lib/utils'
import { isValidRedirectUrl } from '@/lib/validate-url'
import { isValidWebhookUrl } from '@/lib/safe-fetch'
import { handleError, publicErrorMessage } from '@/lib/api-response'
import { productsImageProblem } from '@/lib/image-input'

export async function GET() {
  try {
    const session = await requireSession()
    const [links, paid] = await Promise.all([
      prisma.paymentLink.findMany({
        where: { merchantId: session.id },
        orderBy: { createdAt: 'desc' },
      }),
      // What each link has brought in, counted in the database in one go.
      prisma.transaction.groupBy({
        by: ['paymentLinkId'],
        where: { merchantId: session.id, status: 'success', paymentLinkId: { not: null } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ])
    const byLink = new Map(paid.map(p => [p.paymentLinkId, p]))
    return NextResponse.json(links.map(link => {
      const totals = byLink.get(link.id)
      return {
        ...serializeLink(link),
        paid_count: totals?._count._all ?? 0,
        paid_total: Math.round((totals?._sum.amount ?? 0) * 100) / 100,
      }
    }))
  } catch (err) {
    return handleError(err, 'Could not load your links')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!session.emailVerifiedAt) {
      return NextResponse.json({ error: EMAIL_NOT_VERIFIED }, { status: 403 })
    }
    const body = await req.json()

    if (!body.title || !body.upi_id) {
      return NextResponse.json({ error: 'Title and UPI ID are required' }, { status: 400 })
    }

    // Links only pay into one of the merchant's saved UPI IDs, so a typo can't
    // send customers' money to a stranger.
    const savedUpi = await prisma.upiId.findFirst({
      where: { merchantId: session.id, vpa: { equals: String(body.upi_id).trim(), mode: 'insensitive' } },
    })
    if (!savedUpi) {
      return NextResponse.json({ error: 'Add this UPI ID under UPI IDs first, then choose it for the link.' }, { status: 400 })
    }

    if (body.redirect_url && !isValidRedirectUrl(body.redirect_url)) {
      return NextResponse.json({ error: 'Invalid redirect URL' }, { status: 400 })
    }

    if (body.webhook_url && !isValidWebhookUrl(body.webhook_url)) {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
    }

    // Product images arrive as data URLs; keep them within the same 1 MB limit as logos.
    const imageProblem = productsImageProblem(body.custom_fields)
    if (imageProblem) return NextResponse.json({ error: imageProblem }, { status: 400 })

    // Amounts are kept to whole paise: UPI apps can't charge fractions of a paisa.
    const amount = linkAmountInput(body.amount)
    const minAmount = linkAmountInput(body.min_amount, 'Minimum amount')
    const maxAmount = linkAmountInput(body.max_amount, 'Maximum amount')
    for (const check of [amount, minAmount, maxAmount]) {
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    }
    if (minAmount.ok && maxAmount.ok && minAmount.value && maxAmount.value && minAmount.value > maxAmount.value) {
      return NextResponse.json({ error: "The minimum amount can't be more than the maximum" }, { status: 400 })
    }
    // Optional limits: a bad number or date used to reach the database as is.
    const limits = linkLimitsInput(body.max_uses, body.expiry_at)
    if (!limits.ok) return NextResponse.json({ error: limits.error }, { status: 400 })

    const slug = body.slug || generateSlug()
    const link = await prisma.paymentLink.create({
      data: {
        merchantId: session.id,
        upiId: savedUpi.vpa,
        title: body.title,
        description: body.description || null,
        amount: amount.ok ? amount.value : null,
        amountFlexible: Boolean(body.amount_flexible),
        minAmount: minAmount.ok ? minAmount.value : null,
        maxAmount: maxAmount.ok ? maxAmount.value : null,
        customFields: JSON.stringify(body.custom_fields || []),
        expiryAt: limits.expiryAt,
        maxUses: limits.maxUses,
        buttonText: body.button_text || null,
        redirectUrl: body.redirect_url || null,
        webhookUrl: body.webhook_url || null,
        slug,
      },
    })

    return NextResponse.json({ success: true, link: serializeLink(link) })
  } catch (err: unknown) {
    const msg = publicErrorMessage(err, 'Failed to create link')
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}
