-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('physical', 'digital', 'service');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'draft', 'archived');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('manual_order', 'payment_link', 'website_api', 'instagram', 'whatsapp', 'imported', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'expired', 'refunded');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'new', 'processing', 'on_hold', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "FulfillmentSummaryStatus" AS ENUM ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'partially_delivered', 'delivered', 'attention_required', 'returned', 'cancelled');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('shipping', 'local_delivery', 'pickup', 'digital', 'service');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('unfulfilled', 'processing', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('not_shipped', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled');

-- CreateEnum
CREATE TYPE "ShipmentEventSource" AS ENUM ('merchant', 'system');

-- CreateEnum
CREATE TYPE "StatusHistoryType" AS ENUM ('payment', 'order', 'fulfillment', 'shipment');

-- CreateEnum
CREATE TYPE "ChangedByType" AS ENUM ('merchant', 'system', 'admin');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "address" TEXT,
ADD COLUMN     "default_currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "support_email" TEXT,
ADD COLUMN     "support_phone" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_user_id" TEXT,
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "entity_type" TEXT,
ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "merchant_users" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "tags" JSONB DEFAULT '[]',
    "notes" TEXT,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT NOT NULL,
    "phone" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "compare_at_price" DECIMAL(10,2),
    "image_url" TEXT,
    "product_type" "ProductType" NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "stock_quantity" INTEGER,
    "low_stock_threshold" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "order_number" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL DEFAULT 'manual_order',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal_amount" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "order_status" "OrderStatus" NOT NULL DEFAULT 'new',
    "fulfillment_summary_status" "FulfillmentSummaryStatus" NOT NULL DEFAULT 'unfulfilled',
    "shipping_address_snapshot" JSONB,
    "billing_address_snapshot" JSONB,
    "internal_notes" TEXT,
    "customer_note" TEXT,
    "tracking_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_fulfilled" INTEGER NOT NULL DEFAULT 0,
    "quantity_cancelled" INTEGER NOT NULL DEFAULT 0,
    "quantity_returned" INTEGER NOT NULL DEFAULT 0,
    "line_total" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillments" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "fulfillment_number" TEXT NOT NULL,
    "fulfillment_type" "FulfillmentType" NOT NULL DEFAULT 'shipping',
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'unfulfilled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_at" TIMESTAMP(3),
    "packed_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_items" (
    "id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "courier_provider" TEXT,
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "package_status" "PackageStatus" NOT NULL DEFAULT 'not_shipped',
    "estimated_delivery_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "event_label" TEXT NOT NULL,
    "event_status" TEXT NOT NULL,
    "location" TEXT,
    "event_at" TIMESTAMP(3) NOT NULL,
    "source" "ShipmentEventSource" NOT NULL DEFAULT 'merchant',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "fulfillment_id" TEXT,
    "package_id" TEXT,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "status_type" "StatusHistoryType" NOT NULL,
    "changed_by_user_id" TEXT,
    "changed_by_type" "ChangedByType" NOT NULL DEFAULT 'merchant',
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_users_merchant_id_email_key" ON "merchant_users"("merchant_id", "email");

-- CreateIndex
CREATE INDEX "customers_merchant_id_full_name_idx" ON "customers"("merchant_id", "full_name");

-- CreateIndex
CREATE INDEX "customers_merchant_id_phone_idx" ON "customers"("merchant_id", "phone");

-- CreateIndex
CREATE INDEX "customers_merchant_id_email_idx" ON "customers"("merchant_id", "email");

-- CreateIndex
CREATE INDEX "customer_addresses_merchant_id_customer_id_idx" ON "customer_addresses"("merchant_id", "customer_id");

-- CreateIndex
CREATE INDEX "products_merchant_id_status_idx" ON "products"("merchant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_token_key" ON "orders"("tracking_token");

-- CreateIndex
CREATE INDEX "orders_merchant_id_created_at_idx" ON "orders"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_merchant_id_payment_status_idx" ON "orders"("merchant_id", "payment_status");

-- CreateIndex
CREATE INDEX "orders_merchant_id_order_status_idx" ON "orders"("merchant_id", "order_status");

-- CreateIndex
CREATE INDEX "orders_merchant_id_fulfillment_summary_status_idx" ON "orders"("merchant_id", "fulfillment_summary_status");

-- CreateIndex
CREATE INDEX "orders_merchant_id_source_idx" ON "orders"("merchant_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "orders_merchant_id_order_number_key" ON "orders"("merchant_id", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "fulfillments_merchant_id_order_id_idx" ON "fulfillments"("merchant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillments_merchant_id_fulfillment_number_key" ON "fulfillments"("merchant_id", "fulfillment_number");

-- CreateIndex
CREATE INDEX "fulfillment_items_order_item_id_idx" ON "fulfillment_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_items_fulfillment_id_order_item_id_key" ON "fulfillment_items"("fulfillment_id", "order_item_id");

-- CreateIndex
CREATE INDEX "packages_merchant_id_fulfillment_id_idx" ON "packages"("merchant_id", "fulfillment_id");

-- CreateIndex
CREATE INDEX "shipment_events_merchant_id_package_id_idx" ON "shipment_events"("merchant_id", "package_id");

-- CreateIndex
CREATE INDEX "order_status_history_merchant_id_order_id_idx" ON "order_status_history"("merchant_id", "order_id");

-- AddForeignKey
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "fulfillments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

