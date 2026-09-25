# Courier Shipping & Tracking

> Status: **implemented (Phase 3)**. Mock provider is live; Shiprocket endpoints are
> implemented behind the provider abstraction but not yet exercised against a live account.
> Date: 2026-09-25

## Overview

Merchants create shipments through a courier, receive an AWB + label, schedule pickups,
generate PDF labels, cancel shipments, and initiate returns (RTO). The courier then pushes
tracking events to ToroPay via webhooks; statuses flow into `Package`, mirror to the
fulfillment/order summary, and fire milestone emails to the customer. All courier code lives
under `platform/lib/couriers/`.

## Providers

| Provider    | Status                              |
| ----------- | ----------------------------------- |
| `mock`      | Built-in simulator, always available. Creates shipments/labels/events in memory, signs webhooks exactly like a real provider. Keyed as a **singleton** in `lib/couriers/index.ts` (state must persist across label/pickup/webhook calls). |
| `shiprocket`| Implemented (Shiprocket v2 endpoints) but requires live credentials + the merchant's Shiprocket webhook to be pointed at ToroPay. `testMode: true` connections skip the live `connectAccount` call. |
| `delhivery` | Placeholder — returns `NOT_READY`. |

## Setup: connect Shiprocket

1. Dashboard → **Couriers** → Shiprocket → **Connect**.
2. Enter Shiprocket credentials (email/password + pickup postcode). With **Test mode** on,
   the connection is saved without validating against Shiprocket.
3. Copy the webhook URL shown for the connection:

   `POST https://<your-domain>/api/webhooks/shipping/shiprocket`

4. Paste it into Shiprocket's webhook settings (Shipping → Settings → Webhooks) and set the
   secret to the **Webhook secret** shown on the same screen (copy/reveal button).
5. The webhook signature is HMAC-SHA256 over the raw body, hex-encoded,
   delivered in the `x-courier-signature` header (all providers share this convention for now).

> A merchant can only have one connection per provider. Deleting the connection removes the
> stored credentials and webhook secret. Mock requires no credentials and connects instantly.

## Creating a shipment

- Dashboard → Orders → order → **Create fulfillment** → check **Ship through a courier**,
  choose the provider. Idempotent on `request_id` — replaying the same id returns the same
  package (`providerMetadata.request_id`).
- POST `/api/orders/[id]/shipments` with `{ fulfillment_type, items: [{ order_item_id, quantity }], courier_provider }`.
- For merchants with no live connection, shipment goes through `mock` automatically
  (`getShipmentProviderForMerchant` prefers a connected live provider).

## Tracking flow

- Shipment created → `Package.provider`/`provider_shipment_id`/`awb_number` set, fulfillment
  status `shipped`, `shipment.created` event + `shipment_created` email (deduped).
- Courier pushes events → `POST /api/webhooks/shipping/[provider]`:
  - Persists a `CourierWebhookEvent` (unique on `[provider, provider_event_id]`, fallback to a
    body fingerprint) for dedupe.
  - Resolves the package by AWB / shipment id / tracking number / order number.
  - Verifies the merchant's webhook secret; bad signatures are recorded as `bad_signature`
    and never applied.
  - Applies **monotonic** status updates (`lib/couriers/status-map.ts`): downgrades after a
    terminal state are rejected and flagged `out_of_order`. `delivered`, `returned`,
    `cancelled` are terminal for courier input; fulfillment is only mirrored when
    `canTransitionFulfillment` allows it.
  - Milestone emails are deduped per package via `providerMetadata.emailed_milestones`.
- Fallback reconciliation: POST `/api/courier/sync` (or `syncActiveShipments`) pulls the
  latest status for stale active packages from live providers. Mock packages are excluded.
- Customers track on `/track/{orderNumber}` (multiple packages per order, RTO banner,
  AWB/provider/ETA per package).

## Package actions

Via PATCH `/api/courier/packages/[id]` with `{ action, ... }`:

- `label` — persist the PDF label URL
- `pickup` — schedule pickup (`pickup_date`)
- `cancel` — cancel at the courier (package `cancelled`; fulfillment is not reverted since
  `shipped → cancelled` is not a legal fulfillment transition)
- `return` — initiate RTO, returns a `return_tracking_number`; order summary →
  `attention_required`
- `sync` — pull latest status from the provider

## Emails

New automation keys (`lib/email-templates.ts`): `shipment_created`, `shipment_in_transit`,
`shipment_out_for_delivery`, `shipment_delivered`, `shipment_delivery_failed`,
`shipment_return_initiated`, `shipment_return_delivered`. Variables available on the Emails
page: `{{tracking_url}}`, `{{tracking_number}}`, `{{awb_number}}`, `{{courier_name}}`,
`{{estimated_delivery_at}}`, `{{return_tracking_number}}`.

## Tests

`platform/tests/couriers.test.ts` (14 integration tests): idempotent creation, multi-package
orders, webhook apply/mirror, replay dedupe, bad signature, terminal-state/out-of-order,
RTO (webhook + direct), pickup/cancel, sync skip/errors, email dedupe, partial-delivery
summary, encrypted connections + webhook secret.