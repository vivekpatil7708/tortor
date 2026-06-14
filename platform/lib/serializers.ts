import type { PaymentLink, Transaction, UpiId, Template, MerchantSettings } from '@prisma/client'

export function serializeLink(link: PaymentLink) {
  return {
    id: link.id,
    merchant_id: link.merchantId,
    upi_id: link.upiId,
    title: link.title,
    description: link.description,
    amount: link.amount,
    amount_flexible: link.amountFlexible,
    min_amount: link.minAmount,
    max_amount: link.maxAmount,
    custom_fields: JSON.parse(link.customFields || '[]'),
    expiry_at: link.expiryAt?.toISOString() ?? null,
    max_uses: link.maxUses,
    use_count: link.useCount,
    redirect_url: link.redirectUrl,
    webhook_url: link.webhookUrl,
    slug: link.slug,
    status: link.status,
    created_at: link.createdAt.toISOString(),
    updated_at: link.updatedAt.toISOString(),
  }
}

export function serializeTransaction(txn: Transaction) {
  return {
    id: txn.id,
    merchant_id: txn.merchantId,
    payment_link_id: txn.paymentLinkId,
    txn_id: txn.txnId,
    upi_txn_id: txn.upiTxnId,
    amount: txn.amount,
    customer_name: txn.customerName,
    customer_phone: txn.customerPhone,
    customer_email: txn.customerEmail,
    customer_note: txn.customerNote,
    custom_field_values: JSON.parse(txn.customFieldValues || '{}'),
    status: txn.status,
    settlement_status: txn.settlementStatus,
    settlement_amount: txn.settlementAmount,
    settlement_date: txn.settlementDate?.toISOString() ?? null,
    payment_app: txn.paymentApp,
    payer_vpa: txn.payerVpa,
    upi_payment_ref: txn.upiPaymentRef,
    error_message: txn.errorMessage,
    confirmed_at: txn.confirmedAt?.toISOString() ?? null,
    created_at: txn.createdAt.toISOString(),
    updated_at: txn.updatedAt.toISOString(),
  }
}

export function serializeUpi(upi: UpiId) {
  return {
    id: upi.id,
    merchant_id: upi.merchantId,
    vpa: upi.vpa,
    is_primary: upi.isPrimary,
    verified_at: upi.verifiedAt?.toISOString() ?? null,
    status: upi.status,
    created_at: upi.createdAt.toISOString(),
  }
}

export function serializeTemplate(t: Template) {
  return {
    id: t.id,
    merchant_id: t.merchantId,
    name: t.name,
    config: JSON.parse(t.config || '{}'),
    created_at: t.createdAt.toISOString(),
  }
}

export function serializeSettings(s: MerchantSettings) {
  return {
    merchant_id: s.merchantId,
    sms_enabled: s.smsEnabled,
    email_enabled: s.emailEnabled,
    auto_settlement: s.autoSettlement,
    settlement_frequency: s.settlementFrequency,
    notification_email: s.notificationEmail,
    notification_phone: s.notificationPhone,
    webhook_secret: s.webhookSecret,
    updated_at: s.updatedAt.toISOString(),
  }
}
