import crypto from 'crypto'
import { prisma } from './prisma'

export function signWebhookPayload(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * The merchant's webhook signing secret. Created on first use, so every webhook
 * is signed even when the merchant never set one.
 */
async function getWebhookSecret(merchantId: string, current: string | null | undefined): Promise<string> {
  if (current) return current
  const generated = `whsec_${crypto.randomBytes(24).toString('hex')}`
  await prisma.merchantSettings.upsert({ where: { merchantId }, create: { merchantId }, update: {} })
  // Only fills an empty secret, so concurrent deliveries settle on one value.
  await prisma.merchantSettings.updateMany({ where: { merchantId, webhookSecret: null }, data: { webhookSecret: generated } })
  const settings = await prisma.merchantSettings.findUnique({ where: { merchantId } })
  return settings?.webhookSecret || generated
}

export async function deliverMerchantWebhook(opts: {
  merchantId: string
  transactionId: string
  url: string
  event: string
  payload: Record<string, unknown>
  secret: string
}) {
  const eventId = `evt_${crypto.randomBytes(12).toString('hex')}`
  const body = JSON.stringify({
    event: opts.event,
    event_id: eventId,
    ...opts.payload,
    timestamp: new Date().toISOString(),
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-ToroPay-Signature': signWebhookPayload(body, opts.secret),
    'X-ToroPay-Event-Id': eventId,
  }

  const log = await prisma.webhookLog.create({
    data: {
      merchantId: opts.merchantId,
      transactionId: opts.transactionId,
      url: opts.url,
      payload: body,
      status: 'pending',
    },
  })

  try {
    const res = await fetch(opts.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) })
    const responseBody = await res.text().catch(() => '')

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        status: res.ok ? 'delivered' : 'failed',
        responseCode: res.status,
        responseBody: responseBody.slice(0, 2000),
        deliveredAt: res.ok ? new Date() : null,
        retryCount: res.ok ? 0 : 1,
        nextRetryAt: res.ok ? null : new Date(Date.now() + 60000),
      },
    })
  } catch (err: unknown) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        responseBody: err instanceof Error ? err.message : 'Delivery failed',
        retryCount: 1,
        nextRetryAt: new Date(Date.now() + 60000),
      },
    })
  }
}

export async function notifyPaymentStatus(transactionId: string, status: 'success' | 'failed' | 'pending') {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      paymentLink: { select: { webhookUrl: true, title: true } },
      merchant: { include: { settings: true } },
    },
  })
  if (!txn?.paymentLink?.webhookUrl) return

  await deliverMerchantWebhook({
    merchantId: txn.merchantId,
    transactionId: txn.id,
    url: txn.paymentLink.webhookUrl,
    event: `payment.${status}`,
    secret: await getWebhookSecret(txn.merchantId, txn.merchant.settings?.webhookSecret),
    payload: {
      txn_id: txn.txnId,
      amount: txn.amount,
      status,
      customer_name: txn.customerName,
      customer_phone: txn.customerPhone,
      customer_email: txn.customerEmail,
      payment_app: txn.paymentApp,
      link_title: txn.paymentLink.title,
    },
  })
}
