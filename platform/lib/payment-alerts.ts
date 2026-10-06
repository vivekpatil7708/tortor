import { after } from 'next/server'
import { logAudit } from './audit'
import { TXN_ID_PATTERN } from './checkout-status'
import { escapeHtml, getEmailProvider } from './emails/service'
import { prisma } from './prisma'
import { formatAmount } from './utils'

/** Most alert emails one account gets in an hour, so a burst of fake claims can't flood an inbox. */
export const ALERTS_PER_HOUR = 20
const ALERT_SENT = 'payment_alert_emailed'

type ClaimedPayment = { id: string; merchantId: string; txnId: string; amount: number; paymentLinkId: string | null }

export function renderPaidClaimEmail(p: { amount: string; linkTitle: string; reference: string; transactionsUrl: string }): string {
  const onLink = p.linkTitle ? ` on your payment link <strong>${escapeHtml(p.linkTitle)}</strong>` : ''
  const reference = p.reference
    ? `<p style="margin:0 0 12px;color:#555">Reference: <span style="font-family:monospace">${escapeHtml(p.reference)}</span></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:520px">
<p style="margin:0 0 12px">A customer says they've paid <strong>${escapeHtml(p.amount)}</strong>${onLink}.</p>
${reference}<p style="margin:0 0 16px">Check that the money reached your bank or UPI app, then confirm or reject the payment.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(p.transactionsUrl)}" style="background:#2c2c2c;color:#ffffff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Open transactions</a></p>
<p style="margin:0;font-size:12px;color:#888">You get this email because payment alerts are on in ToroPay: Settings, Notifications.</p>
</div>`
}

type AlertOutcome = 'sent' | 'off' | 'limit' | 'failed'

/**
 * Emails the merchant (Settings → Notifications) when a customer says they've
 * paid. It holds only the amount, the merchant's own link name and the payment
 * reference, never anything the customer typed. Never throws.
 */
export async function sendPaidClaimAlert(payment: ClaimedPayment): Promise<AlertOutcome> {
  const { outcome, detail } = await attemptPaidClaimAlert(payment)
  // One line per alert, so a missing email can be traced. Never the address.
  const line = `Payment alert ${outcome} for transaction ${payment.id}${detail ? ` (${detail})` : ''}`
  if (outcome === 'failed') console.error(line)
  else console.info(line)
  return outcome
}

async function attemptPaidClaimAlert(payment: ClaimedPayment): Promise<{ outcome: AlertOutcome; detail?: string }> {
  try {
    const settings = await prisma.merchantSettings.findUnique({
      where: { merchantId: payment.merchantId },
      select: { emailEnabled: true, notificationEmail: true },
    })
    if (!settings?.emailEnabled) return { outcome: 'off', detail: 'alerts are switched off' }
    const merchant = await prisma.merchant.findUnique({ where: { id: payment.merchantId }, select: { email: true } })
    const to = settings.notificationEmail?.trim() || merchant?.email
    if (!to) return { outcome: 'off', detail: 'no address to send to' }

    const sentLastHour = await prisma.auditLog.count({
      where: { merchantId: payment.merchantId, action: ALERT_SENT, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    })
    if (sentLastHour >= ALERTS_PER_HOUR) return { outcome: 'limit', detail: `${ALERTS_PER_HOUR} already sent this hour` }

    const link = payment.paymentLinkId
      ? await prisma.paymentLink.findUnique({ where: { id: payment.paymentLinkId }, select: { title: true } })
      : null
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.toropay.co.in').replace(/\/+$/, '')
    const amount = formatAmount(payment.amount)
    const result = await getEmailProvider().sendTransactionalEmail({
      to,
      subject: `A customer says they've paid ${amount}`,
      html: renderPaidClaimEmail({
        amount,
        linkTitle: link?.title ?? '',
        reference: TXN_ID_PATTERN.test(payment.txnId) ? payment.txnId : '',
        transactionsUrl: `${appUrl}/dashboard/transactions`,
      }),
    })
    if (!result.ok) return { outcome: 'failed', detail: result.error ?? 'email service refused it' }
    await logAudit({ merchantId: payment.merchantId, action: ALERT_SENT, entityType: 'transaction', entityId: payment.id })
    return { outcome: 'sent' }
  } catch (err) {
    return { outcome: 'failed', detail: err instanceof Error ? err.message.slice(0, 160) : 'unknown error' }
  }
}

/** Sends the alert once the customer's answer has gone out, so they never wait for the email. */
export function queuePaidClaimAlert(payment: ClaimedPayment) {
  after(async () => {
    await sendPaidClaimAlert(payment)
  })
}
