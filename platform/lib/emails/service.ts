import { prisma } from '@/lib/prisma'
import type { EmailAutomation } from '@prisma/client'
import { MockEmailProvider, ResendEmailProvider, type EmailProvider } from './provider'
import {
  DEFAULT_EMAIL_TEMPLATES,
  renderEmailTemplate,
  buildProductList,
  sampleEmailContext,
  type EmailContext,
} from './templates'

let providerInstance: EmailProvider | null = null

export function getEmailProvider(): EmailProvider {
  if (providerInstance) return providerInstance
  providerInstance = process.env.RESEND_API_KEY ? new ResendEmailProvider() : new MockEmailProvider()
  return providerInstance
}

export function resetEmailProviderForTests(): void {
  providerInstance = null
}

/** Seed default templates for a merchant on first use. */
export async function ensureEmailTemplates(merchantId: string): Promise<void> {
  const existing = await prisma.emailTemplate.findMany({ where: { merchantId } })
  const existingKeys = new Set(existing.map(t => t.key))

  const toCreate = (Object.keys(DEFAULT_EMAIL_TEMPLATES) as EmailAutomation[]).filter(
    key => !existingKeys.has(key)
  )

  if (!toCreate.length) return

  await prisma.emailTemplate.createMany({
    data: toCreate.map(key => ({
      merchantId,
      key,
      subject: DEFAULT_EMAIL_TEMPLATES[key].subject,
      body: DEFAULT_EMAIL_TEMPLATES[key].body,
      isActive: true,
      isDefault: false,
    })),
  })
}

export async function getEmailSetting(merchantId: string, key: EmailAutomation) {
  await ensureEmailTemplates(merchantId)
  const row = await prisma.emailTemplate.findUnique({ where: { merchantId_key: { merchantId, key } } })
  return {
    key,
    subject: row?.subject ?? DEFAULT_EMAIL_TEMPLATES[key].subject,
    body: row?.body ?? DEFAULT_EMAIL_TEMPLATES[key].body,
    is_active: row?.isActive ?? true,
    is_default: !row,
    default_subject: DEFAULT_EMAIL_TEMPLATES[key].subject,
    default_body: DEFAULT_EMAIL_TEMPLATES[key].body,
  }
}

export async function getEmailSettings(merchantId: string) {
  await ensureEmailTemplates(merchantId)
  const rows = await prisma.emailTemplate.findMany({ where: { merchantId }, orderBy: { key: 'asc' } })
  return rows.map(row => ({
    key: row.key,
    subject: row.subject,
    body: row.body,
    is_active: row.isActive,
    is_default: row.isDefault,
    default_subject: DEFAULT_EMAIL_TEMPLATES[row.key].subject,
    default_body: DEFAULT_EMAIL_TEMPLATES[row.key].body,
  }))
}

export async function updateEmailSetting(params: {
  merchantId: string
  key: EmailAutomation
  subject?: string
  body?: string
  isActive?: boolean
}) {
  await ensureEmailTemplates(params.merchantId)
  const existing = await prisma.emailTemplate.findUnique({
    where: { merchantId_key: { merchantId: params.merchantId, key: params.key } },
  })

  const data: Partial<{ subject: string; body: string; isActive: boolean; isDefault: boolean }> = {}
  if (params.subject !== undefined) data.subject = params.subject
  if (params.body !== undefined) data.body = params.body
  if (params.isActive !== undefined) data.isActive = params.isActive
  if (existing?.isDefault) data.isDefault = false

  if (existing) {
    await prisma.emailTemplate.update({ where: { id: existing.id }, data })
  } else {
    await prisma.emailTemplate.create({
      data: {
        merchantId: params.merchantId,
        key: params.key,
        subject: params.subject ?? DEFAULT_EMAIL_TEMPLATES[params.key].subject,
        body: params.body ?? DEFAULT_EMAIL_TEMPLATES[params.key].body,
        isActive: params.isActive ?? true,
        isDefault: false,
      },
    })
  }
  return getEmailSetting(params.merchantId, params.key)
}

function renderHtml(body: string): string {
  const safe = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:-apple-system,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #eee;padding:32px;">
<tr><td style="white-space:pre-wrap;color:#333;font-size:14px;line-height:1.7;">${safe}</td></tr>
</table></td></tr></table>
</body></html>`
}

/**
 * Send a transactional email for an automation. Uses the merchant template
 * (or default), persists a log row, then dispatches via the configured
 * provider. Never throws — failures are recorded on the log row.
 */
export async function sendAutomatedEmail(params: {
  merchantId: string
  key: EmailAutomation
  to?: string | null
  context?: Partial<EmailContext>
}): Promise<{ logId: string; status: string } | null> {
  const logId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const { merchantId, key, to } = params
  if (!to) return null

  const setting = await getEmailSetting(merchantId, key)
  if (!setting.is_active) return null

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { businessName: true, supportEmail: true, supportPhone: true },
  })

  const fullContext = {
    customer_name: 'Customer',
    business_name: merchant?.businessName || 'ToroPay business',
    order_number: '-',
    amount: '0.00',
    currency: 'INR',
    product_list: '-',
    payment_link: '',
    support_email: merchant?.supportEmail || '',
    support_phone: merchant?.supportPhone || '',
    tracking_number: '-',
    awb_number: '-',
    courier_name: '-',
    tracking_url: '',
    estimated_delivery: '-',
    event_location: '-',
    return_tracking_number: '-',
    ...(params.context ?? {}),
  }

  const subject = renderEmailTemplate(setting.subject, fullContext)
  const body = renderEmailTemplate(setting.body, fullContext)
  const html = renderHtml(body)

  const provider = getEmailProvider()

  try {
    const result = await provider.sendTransactionalEmail({ to, subject, html })
    const status = result.ok ? 'sent' : 'failed'
    await logEmail({
      logId,
      merchantId,
      key,
      recipient: to,
      subject,
      body,
      status,
      provider: provider.name,
      providerMessageId: result.providerMessageId,
      errorMessage: result.ok ? null : 'Provider rejected the email',
    })
    return { logId, status }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email send failed'
    await logEmail({
      logId,
      merchantId,
      key,
      recipient: to,
      subject,
      body,
      status: 'failed',
      provider: provider.name,
      providerMessageId: null,
      errorMessage: message,
    })
    return { logId, status: 'failed' }
  }
}

async function logEmail(params: {
  logId: string
  merchantId: string
  key: EmailAutomation
  recipient: string
  subject: string
  body: string
  status: 'queued' | 'sent' | 'failed'
  provider: string
  providerMessageId: string | null
  errorMessage: string | null
}) {
  await prisma.emailLog.create({
    data: {
      merchantId: params.merchantId,
      templateKey: params.key,
      recipient: params.recipient,
      subject: params.subject,
      renderedBody: params.body,
      status: params.status,
      provider: params.provider,
      providerMessageId: params.providerMessageId,
      errorMessage: params.errorMessage,
    },
  })
}

/** Send a test email using sample variable values. */
export async function sendTestEmail(merchantId: string, key: EmailAutomation, to: string) {
  const setting = await getEmailSetting(merchantId, key)
  const context = sampleEmailContext()
  const fullContext = {
    ...context,
    support_email: context.support_email,
    support_phone: context.support_phone,
  }
  const subject = renderEmailTemplate(setting.subject, fullContext)
  const body = renderEmailTemplate(setting.body, fullContext)
  const html = renderHtml(body)

  const provider = getEmailProvider()
  const result = await provider.sendTransactionalEmail({ to, subject, html })
  await logEmail({
    logId: `email_test_${Date.now()}`,
    merchantId,
    key,
    recipient: to,
    subject,
    body,
    status: result.ok ? 'sent' : 'failed',
    provider: provider.name,
    providerMessageId: result.providerMessageId,
    errorMessage: result.ok ? null : 'Provider rejected the email',
  })
  return { subject, body, status: result.ok ? 'sent' : 'failed' }
}

/** Build the product_list / amount context for an order + payment. */
export function buildEmailContextFromCheckout(params: {
  orderNumber: string
  amount: number
  currency: string
  customerName?: string | null
  products: Array<{ name: string; quantity: number; line_total: number }>
  checkoutUrl: string
  supportEmail?: string | null
  supportPhone?: string | null
  tracking?: Partial<{
    tracking_number: string
    awb_number: string
    courier_name: string
    tracking_url: string
    estimated_delivery: string
    event_location: string
    return_tracking_number: string
  }>
}): EmailContext {
  return {
    customer_name: params.customerName || 'Customer',
    business_name: '',
    order_number: params.orderNumber,
    amount: params.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    currency: params.currency,
    product_list: buildProductList(params.products),
    payment_link: params.checkoutUrl,
    support_email: params.supportEmail || '',
    support_phone: params.supportPhone || '',
    tracking_number: params.tracking?.tracking_number ?? '-',
    awb_number: params.tracking?.awb_number ?? '-',
    courier_name: params.tracking?.courier_name ?? '-',
    tracking_url: params.tracking?.tracking_url ?? '',
    estimated_delivery: params.tracking?.estimated_delivery ?? '-',
    event_location: params.tracking?.event_location ?? '-',
    return_tracking_number: params.tracking?.return_tracking_number ?? '-',
  }
}

export { EMAIL_AUTOMATION_LABELS, SUPPORTED_EMAIL_VARIABLES } from './templates'