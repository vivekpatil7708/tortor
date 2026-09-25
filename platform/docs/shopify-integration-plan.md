# Shopify Integration — Option 1 Plan (Deferred / Future Update)

> Status: **planned, not started**. Kept for future implementation.
> Date: 2026-08-05

## Goal

A real Shopify app integration that lets Indian Shopify merchants collect UPI payments
via ToroPay and have the Shopify order marked paid automatically (after merchant
confirmation), eliminating gateway MDR + the Shopify 2% third-party surcharge on those
payments.

## Core constraint (read first)

ToroPay's UPI flow has **no automatic payment confirmation**: money goes directly to the
merchant's UPI ID and ToroPay never sees the bank transfer
(`platform/app/pay/[slug]/checkout-client.tsx`). Confirmation today is:

1. Customer pays UPI and taps "I've completed payment"
2. Merchant confirms success in the ToroPay dashboard
3. `PATCH /api/transactions/[txnId]` sets status `success`
4. `notifyPaymentStatus()` fires the link's webhook (`platform/lib/webhooks.ts:65`)

So the integration uses that existing hook: when the merchant confirms the payment in
ToroPay, a webhook tells the app to mark the Shopify order paid. It can never be fully
automatic (no gateway can see a bank-to-bank UPI transfer).

## Flow

```
Shopify cart -> "Pay with ToroPay UPI" button (app block)
  -> app creates a ToroPay PaymentLink (amount = order total, webhook_url = app callback)
  -> redirect to toropay.co.in/pay/{slug}  (hosted branded page)
  -> customer pays UPI, declares payment
  -> merchant confirms success in ToroPay dashboard
  -> ToroPay webhook payment.success -> app route
  -> app calls Shopify Admin API: POST /orders/{id}/transactions.json {kind: sale, status: success, gateway: "ToroPay UPI"}
  -> Shopify order marked paid, confirmation emails fire
```

## New code

### 1. Shopify OAuth + session
Shopify apps require their own OAuth (not ToroPay cookie auth).

- `prisma/schema.prisma`: add `ShopifySession` (shop, accessToken, scopes) and
  `ShopifyOrder` (shopifyOrderId, txnId, status, amount) models + relations on `Merchant`
- `lib/shopify.ts`: HMAC verify, build install URL, exchange code -> token, Shopify
  Admin API client, `recordOrderPayment()` (creates the transaction)
- `app/shopify/auth/route.ts` — install start
- `app/shopify/auth/callback/route.ts` — token exchange, store session, register
  `app/uninstalled` webhook, redirect into embedded admin

### 2. Payment flow
- `app/api/shopify/checkout/route.ts` — called by the storefront button: finds the
  ToroPay merchant, creates the PaymentLink programmatically (slug + `webhookUrl` =
  the callback below, `redirectUrl` = the status page), returns the `/pay/{slug}` URL
- `app/api/shopify/payment-webhook/route.ts` — receives `payment.success`/`failed`
  (verify `X-ToroPay-Signature`), idempotent on `txn_id`, calls `recordOrderPayment()`,
  updates `ShopifyOrder`
- `app/shopify/order-status/page.tsx` — client page showing "Payment received — pending
  merchant confirmation" after redirect back

### 3. Theme app extension (storefront button)
New `shopify-extensions/` directory (Liquid block + JS asset) shipped via Shopify CLI.
This is the piece merchants add to their theme in the Shopify admin.

### 4. Dashboard
- `app/(dashboard)/dashboard/integrations/page.tsx` (new): "Connect Shopify" button ->
  `/shopify/auth?shop=...`, shows connected store + install status

## Changes to existing files

| File | Change |
|---|---|
| `platform/prisma/schema.prisma` | +2 models (run `prisma db push`, regenerate client) |
| `platform/lib/webhooks.ts` | no change — already fires `payment.success` with `txn_id`/`amount` |
| `platform/app/api/links/route.ts` | no change — the checkout route uses it to create the link (or reuses the same logic server-side) |
| `.env` / Vercel env | `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_SCOPES` (`write_orders`, `read_orders`), `SHOPIFY_API_VERSION` |

## Prereqs

- Shopify Partner account -> create a custom app -> get API key/secret -> set App URL +
  redirect URL to `https://www.toropay.co.in/shopify/auth/callback`
- A Shopify store to test against

## Caveats

- Payment is not confirmed until the merchant marks it paid (see constraint) — the
  status page + webhook must communicate that clearly
- Needs a retry job for failed webhook deliveries (`WebhookLog` already tracks
  `retryCount`/`nextRetryAt`; add a cron to actually retry)
- The app block requires the merchant to install a theme app extension
- Embedded app needs a CSP exception for `admin.shopify.com` iframe

## Effort estimate

- 1–2 days: OAuth + webhook core
- +1 day: theme extension + polish
