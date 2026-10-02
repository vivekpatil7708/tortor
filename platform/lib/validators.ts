import { z } from 'zod'

// ============================================================
// PRODUCTS
// ============================================================

export const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().min(0, 'Price must be 0 or more'),
  compare_at_price: z.number().min(0).optional().nullable(),
  image_url: z.string().url().optional().nullable().or(z.literal('')).nullable(),
  product_type: z.enum(['physical', 'digital', 'service']),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  stock_quantity: z.number().int().min(0).optional().nullable(),
  low_stock_threshold: z.number().int().min(0).optional().nullable(),
})

// ============================================================
// CUSTOMERS
// ============================================================

export const customerSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')).nullable(),
  tags: z.array(z.string().max(50)).max(50).optional().default([]),
  notes: z.string().max(5000).optional().nullable(),
})

export const addressSchema = z.object({
  label: z.string().max(50).optional().nullable(),
  recipient_name: z.string().min(1, 'Recipient name is required').max(200),
  phone: z.string().max(20).optional().nullable(),
  line1: z.string().min(1, 'Address line 1 is required').max(500),
  line2: z.string().max(500).optional().nullable(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: z.string().min(6, 'Enter a valid pincode').max(10),
  country: z.string().max(100).optional().default('India'),
  is_default: z.boolean().optional().default(false),
})

// ============================================================
// ORDERS
// ============================================================

export const orderItemSchema = z.object({
  product_id: z.string().optional().nullable(),
  product_name: z.string().min(1, 'Product name is required').max(200),
  sku: z.string().max(100).optional().nullable(),
  unit_price: z.number().min(0),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100000),
})

export const createOrderSchema = z.object({
  customer_id: z.string().optional().nullable(),
  customer: z.object({
    full_name: z.string().min(1).max(200),
    phone: z.string().max(20).optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal('')).nullable(),
  }).optional().nullable(),
  source: z.enum(['manual_order', 'payment_link', 'website_api', 'instagram', 'whatsapp', 'imported', 'other']).default('manual_order'),
  items: z.array(orderItemSchema).min(1, 'Add at least one item'),
  discount_amount: z.number().min(0).optional().default(0),
  shipping_amount: z.number().min(0).optional().default(0),
  tax_amount: z.number().min(0).optional().default(0),
  shipping_address: z.record(z.unknown()).optional().nullable(),
  billing_address: z.record(z.unknown()).optional().nullable(),
  internal_notes: z.string().max(5000).optional().nullable(),
  customer_note: z.string().max(5000).optional().nullable(),
  payment_status: z.enum(['pending', 'paid', 'failed', 'expired', 'refunded']).default('pending'),
  order_status: z.enum(['pending_payment', 'new', 'processing', 'on_hold', 'completed', 'cancelled']).default('new'),
})

export const statusChangeSchema = z.object({
  status: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
})

export const notesSchema = z.object({
  internal_notes: z.string().max(5000).optional().nullable(),
})

// ============================================================
// FULFILLMENTS
// ============================================================

export const fulfillmentItemSchema = z.object({
  order_item_id: z.string().min(1),
  quantity: z.number().int().min(1),
})

export const createFulfillmentSchema = z.object({
  fulfillment_type: z.enum(['shipping', 'local_delivery', 'pickup', 'digital', 'service']).default('shipping'),
  items: z.array(fulfillmentItemSchema).min(1, 'Select at least one item'),
})

export const fulfillmentItemPatchSchema = z.object({
  order_item_id: z.string().min(1),
  quantity: z.number().int().min(1),
  action: z.enum(['set']).default('set'),
})

export const packageSchema = z.object({
  courier_provider: z.string().max(100).optional().nullable(),
  tracking_number: z.string().max(100).optional().nullable(),
  tracking_url: z.string().url().optional().nullable().or(z.literal('')).nullable(),
  estimated_delivery_at: z.string().optional().nullable(),
  mark_shipped: z.boolean().optional().default(true),
})

export const shipmentEventSchema = z.object({
  event_label: z.string().min(1, 'Event label is required').max(200),
  event_status: z.string().max(100).optional().default('info'),
  location: z.string().max(200).optional().nullable(),
  event_at: z.string().optional().nullable(),
})

// ============================================================
// PHASE 3 — COURIER SHIPMENTS
// ============================================================

export const createProviderShipmentSchema = z.object({
  fulfillment_type: z.enum(['shipping', 'local_delivery']).default('shipping'),
  items: z.array(fulfillmentItemSchema).min(1, 'Select at least one item'),
  courier_provider: z.string().max(50).optional().nullable(),
  courier_preference: z.string().max(100).optional().nullable(),
  weight_kg: z.number().positive().optional().nullable(),
  length_cm: z.number().positive().optional().nullable(),
  breadth_cm: z.number().positive().optional().nullable(),
  height_cm: z.number().positive().optional().nullable(),
  payment_mode: z.enum(['PREPAID', 'COD']).optional().default('PREPAID'),
  pickup_scheduled_at: z.string().optional().nullable(),
  request_id: z.string().max(100).optional().nullable(),
})

export const courierConnectionSchema = z.object({
  provider: z.enum(['mock', 'shiprocket', 'delhivery']),
  label: z.string().max(120).optional().nullable(),
  test_mode: z.boolean().optional().default(false),
  credentials: z.record(z.unknown()).optional().nullable(),
  active: z.boolean().optional().default(true),
})

export const courierPackageActionSchema = z.object({
  action: z.enum(['label', 'pickup', 'cancel', 'return', 'sync']),
  pickup_date: z.string().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
})

// ============================================================
// DASHBOARD / QUERY
// ============================================================

export const orderListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  payment_status: z.string().optional(),
  order_status: z.string().optional(),
  fulfillment_status: z.string().optional(),
  source: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'amount']).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const customerListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const productListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  product_type: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(50),
})

export const merchantProfileSchema = z.object({
  business_name: z.string().min(1).max(200),
  support_email: z.string().email().optional().nullable().or(z.literal('')).nullable(),
  support_phone: z.string().max(20).optional().nullable(),
  address: z.string().max(2000).optional().nullable(),
  timezone: z.string().max(100).optional().default('Asia/Kolkata'),
  default_currency: z.string().max(10).optional().default('INR'),
})