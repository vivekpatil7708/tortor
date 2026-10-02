import type {
  PaymentLink,
  Transaction,
  UpiId,
  Template,
  MerchantSettings,
  Customer,
  CustomerAddress,
  Product,
  Order,
  OrderItem,
  Fulfillment,
  FulfillmentItem,
  Package,
  ShipmentEvent,
  OrderStatusHistory,
} from '@prisma/client'

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
    button_text: link.buttonText,
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

export function maskSecret(secret: string) {
  return `${'*'.repeat(Math.max(0, secret.length - 4))}${secret.slice(-4)}`
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
    webhook_secret: s.webhookSecret ? maskSecret(s.webhookSecret) : null,
    updated_at: s.updatedAt.toISOString(),
  }
}

export function serializeCustomer(c: Customer) {
  const rawTags = c.tags as unknown as Array<{ id?: string; name: string } | string> | null
  return {
    id: c.id,
    merchant_id: c.merchantId,
    full_name: c.fullName,
    phone: c.phone,
    email: c.email,
    tags: Array.isArray(rawTags)
      ? rawTags.map(t => (typeof t === 'string' ? t : (t?.name ?? String(t))))
      : [],
    notes: c.notes,
    total_orders: c.totalOrders,
    total_spent: c.totalSpent,
    last_order_at: c.lastOrderAt?.toISOString() ?? null,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  }
}

export function serializeAddress(a: CustomerAddress) {
  return {
    id: a.id,
    customer_id: a.customerId,
    merchant_id: a.merchantId,
    label: a.label,
    recipient_name: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country,
    is_default: a.isDefault,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  }
}

export function serializeProduct(p: Product) {
  return {
    id: p.id,
    merchant_id: p.merchantId,
    name: p.name,
    description: p.description,
    sku: p.sku,
    price: p.price.toNumber(),
    compare_at_price: p.compareAtPrice?.toNumber() ?? null,
    image_url: p.imageUrl,
    product_type: p.productType,
    status: p.status,
    stock_quantity: p.stockQuantity,
    low_stock_threshold: p.lowStockThreshold,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  }
}

export function serializeOrderItem(i: OrderItem) {
  return {
    id: i.id,
    order_id: i.orderId,
    product_id: i.productId,
    product_name_snapshot: i.productNameSnapshot,
    sku_snapshot: i.skuSnapshot,
    unit_price: i.unitPrice.toNumber(),
    quantity_ordered: i.quantityOrdered,
    quantity_fulfilled: i.quantityFulfilled,
    quantity_cancelled: i.quantityCancelled,
    quantity_returned: i.quantityReturned,
    line_total: i.lineTotal.toNumber(),
    created_at: i.createdAt.toISOString(),
    updated_at: i.updatedAt.toISOString(),
  }
}

export function serializeFulfillmentItem(fi: FulfillmentItem & { orderItem?: OrderItem | null }) {
  return {
    id: fi.id,
    fulfillment_id: fi.fulfillmentId,
    order_item_id: fi.orderItemId,
    quantity: fi.quantity,
    created_at: fi.createdAt.toISOString(),
    order_item: fi.orderItem ? serializeOrderItem(fi.orderItem) : null,
  }
}

export function serializeFulfillment(f: Fulfillment) {
  return {
    id: f.id,
    merchant_id: f.merchantId,
    order_id: f.orderId,
    fulfillment_number: f.fulfillmentNumber,
    fulfillment_type: f.fulfillmentType,
    status: f.status,
    created_at: f.createdAt.toISOString(),
    processing_at: f.processingAt?.toISOString() ?? null,
    packed_at: f.packedAt?.toISOString() ?? null,
    shipped_at: f.shippedAt?.toISOString() ?? null,
    delivered_at: f.deliveredAt?.toISOString() ?? null,
    cancelled_at: f.cancelledAt?.toISOString() ?? null,
    updated_at: f.updatedAt.toISOString(),
  }
}

export function serializePackage(p: Package & { events?: ShipmentEvent[] }) {
  return {
    id: p.id,
    merchant_id: p.merchantId,
    fulfillment_id: p.fulfillmentId,
    courier_provider: p.courierProvider,
    tracking_number: p.trackingNumber,
    tracking_url: p.trackingUrl,
    package_status: p.packageStatus,
    estimated_delivery_at: p.estimatedDeliveryAt?.toISOString() ?? null,
    shipped_at: p.shippedAt?.toISOString() ?? null,
    delivered_at: p.deliveredAt?.toISOString() ?? null,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    // Phase 3 — provider-backed shipment details
    provider: p.provider,
    provider_shipment_id: p.providerShipmentId,
    awb_number: p.awbNumber,
    label_url: p.labelUrl,
    pickup_scheduled_at: p.pickupScheduledAt?.toISOString() ?? null,
    picked_up_at: p.pickedUpAt?.toISOString() ?? null,
    rto_initiated_at: p.rtoInitiatedAt?.toISOString() ?? null,
    rto_delivered_at: p.rtoDeliveredAt?.toISOString() ?? null,
    return_tracking_number: p.returnTrackingNumber,
    last_provider_sync_at: p.lastProviderSyncAt?.toISOString() ?? null,
    provider_metadata: p.providerMetadata ?? null,
    events: p.events ? p.events.map(serializeShipmentEvent) : undefined,
  }
}

export function serializeShipmentEvent(e: ShipmentEvent) {
  return {
    id: e.id,
    merchant_id: e.merchantId,
    package_id: e.packageId,
    event_label: e.eventLabel,
    event_status: e.eventStatus,
    location: e.location,
    event_at: e.eventAt.toISOString(),
    source: e.source,
    created_at: e.createdAt.toISOString(),
  }
}

export function serializeStatusHistory(h: OrderStatusHistory) {
  return {
    id: h.id,
    merchant_id: h.merchantId,
    order_id: h.orderId,
    fulfillment_id: h.fulfillmentId,
    package_id: h.packageId,
    previous_status: h.previousStatus,
    new_status: h.newStatus,
    status_type: h.statusType,
    changed_by_user_id: h.changedByUserId,
    changed_by_type: h.changedByType,
    change_reason: h.changeReason,
    created_at: h.createdAt.toISOString(),
  }
}

export function serializeOrder(o: Order & {
  orderItems?: OrderItem[]
  customer?: (Customer & { addresses?: CustomerAddress[] }) | null
  fulfillments?: (Fulfillment & {
    items?: FulfillmentItem[]
    packages?: Package[]
  })[]
  statusHistory?: OrderStatusHistory[]
}) {
  return {
    id: o.id,
    merchant_id: o.merchantId,
    customer_id: o.customerId,
    order_number: o.orderNumber,
    source: o.source,
    currency: o.currency,
    subtotal_amount: o.subtotalAmount.toNumber(),
    discount_amount: o.discountAmount.toNumber(),
    shipping_amount: o.shippingAmount.toNumber(),
    tax_amount: o.taxAmount.toNumber(),
    total_amount: o.totalAmount.toNumber(),
    payment_status: o.paymentStatus,
    order_status: o.orderStatus,
    fulfillment_summary_status: o.fulfillmentSummaryStatus,
    shipping_address_snapshot: o.shippingAddressSnapshot,
    billing_address_snapshot: o.billingAddressSnapshot,
    internal_notes: o.internalNotes,
    customer_note: o.customerNote,
    created_at: o.createdAt.toISOString(),
    paid_at: o.paidAt?.toISOString() ?? null,
    cancelled_at: o.cancelledAt?.toISOString() ?? null,
    completed_at: o.completedAt?.toISOString() ?? null,
    updated_at: o.updatedAt.toISOString(),
    customer: o.customer ? serializeCustomer(o.customer) : null,
    order_items: o.orderItems?.map(serializeOrderItem),
    fulfillments: o.fulfillments?.map(f => ({
      ...serializeFulfillment(f),
      items: f.items?.map(i => serializeFulfillmentItem(i)),
      packages: f.packages?.map(p => serializePackage(p)),
    })),
    status_history: o.statusHistory?.map(serializeStatusHistory),
  }
}
