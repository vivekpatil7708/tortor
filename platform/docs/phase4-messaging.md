# Phase 4 — Messaging, Automations, Returns, Inventory & Analytics

> Status: **implemented (Phase 4)**. Everything runs against the built-in mock messaging
> provider and is fully tested (112 tests green, tsc clean, lint clean, `next build` ok).
> Live WhatsApp Business / Instagram sender-credential validation is implemented behind the
> provider abstraction and requires live `MOCK_ALLOWED=false` credentials + webhooks.
> Date: 2026-09-25

## Overview

ToroPay Phase 4 ships the remaining operational layers on top of Phases 1–3:

- **Messaging engine** — provider-agnostic WhatsApp / Instagram / email sends with templates,
  dedupe, consent gates, retries, and per-channel log history.
- **Automations** — merchant workflow rules that fire sends on order/label/refund events.
- **Follow-up tasks** — internal task suggestions (e.g. chase a stale pending order).
- **Returns & refunds** — RMA lifecycle where the payment provider webhook is the source of truth
  for refund completion.
- **Inventory** — stock hooks: deduct on payment, restore on cancel, manual adjustments.
- **Analytics** — order-based metrics (timeseries, status funnel, top SKUs/channels, movements).
- **Segments** — saved customer segment presets evaluated against orders + consent-gated sends.

All messaging code lives under `platform/lib/messaging/`, returns/refunds under
`platform/lib/returns/` and `platform/lib/refunds/`, inventory under `platform/lib/inventory.ts`,
analytics under `platform/lib/analytics/`, segments under `platform/lib/segments.ts`.

## Messaging providers

| Provider              | Status |
| --------------------- | ------ |
| `mock-messaging`      | Built-in simulator. Always resolvable, no network. Accepts any send targeting a phone/email and records an "accepted" receipt (idempotency payload echoed back) so the full send/webhook/receipt flow is testable offline. Singleton. |
| `whatsapp`            | **No credentials → always resolves to mock**; with credentials, validates shape (`accessToken`, `phoneNumberId`, `wabaId`) and posts to the WhatsApp Business Cloud API (legacy-config layout: recipient phone is read from context `to`). |
| `instagram`           | Same behaviour; posts DMs via the Instagram Messaging API using `accessToken`/`userId`. |
| `email`               | Wraps `lib/emails/service.ts` (`getEmailProvider`). No connect flow — uses the built-in provider. |

Why the mock fallback is safe: the **dispatch layer** (`dispatchLog` in `lib/messaging/engine.ts`)
fails a WhatsApp/Instagram send as `channel_not_connected` when the resolved provider is mock **and
`mockMessagingAllowed()` is false**. In development/tests `MOCK_ALLOWED` is set by
`tests/setup.ts`, so mock sends succeed; in production a merchant with no connection gets a clean,
recorded failure instead of a fake "sent" message.

## Channels & connections

- Connection lifecycle: `GET /api/messages/settings` (status), `POST` with
  `action: connect | disconnect | regenerate-webhook | test`.
- Credentials are stored **encrypted** (env `MESSAGING_KEY`), in `ChannelConnection`
  (`provider`, `account_id`, `credentials` Json, `webhook_url`, `webhook_secret`, status/error,
  last sync). One connection per channel; `metadata` is free-form.
- `connect` validates credentials via the provider's `validateConfiguration` before saving;
  unknown actions / channels are rejected. Email cannot be "connected" here.
- Test-action sends a `manual_message` through the engine and surfaces `channel_not_connected`
  as a 500 when the channel is unavailable.

## Templates

- `MessageTemplate` (`name`, `event_type`, `channel`, `subject`, `body`) with merchant override.
- `resolveMessageTemplate` falls back to built-in bodies in `lib/messaging/events.ts`
  (`MANUAL_BODY`, `EMAIL_BODY`); there is no built-in body for the unknown event
  `manual_campaign` — segment sends use `manual_message` (see below).
- `renderMessageTemplate` substitutes `{{variable}}` placeholders from a context
  (customer name, order number, amount, booking ID, etc.); unknown keys are left as-is.
- `sampleMessageContext` provides safe mergeable defaults for the settings "test send".

## Send pipeline (`sendMessage` → `dispatchLog`)

1. `sendMessage` builds a context, checks consent gates for promotional events
   (`marketingConsent`, `optedOutChannels` in `canSendToCustomer`), resolves the message
   template, then calls `dispatchLog`.
2. `dispatchLog` creates/updates a `MessageLog`, resolves the provider (mock fallback for
   missing WhatsApp/Instagram creds), applies the `channel_not_connected` guard above,
   validates configuration, renders the body, fires the provider `post()` with an
   **idempotency key** (dedupe: same merchant/channel/event/key is not sent twice — logged as
   `duplicate`), and records success/`failureReason`.
3. Legacy provider adapters also address WhatsApp/Instagram modernization shims — they supply
   the provider event id needed by `MessageEvent` (unique on `[provider, provider_event_id]`).

Log entries are queryable via `GET /api/messages/logs` (`logs`, `total`, `limit`, `offset`),
and `retryFailedMessage` re-queues then re-dispatches a failed log (`updated` via
`markMessageLog`).

## Automations

- `AutomationRule` (`event_type`, `channel`, `template_name`, `marketing_consent_required`,
  `enabled`). Saved in `MerchantSettings` too for fast dashboards.
- `ensureAutomationRules` seeds **disabled** rules per channel on first request:
  WhatsApp + Instagram get rules for every event; email only for `EMAIL_ONLY_EVENTS`
  (payment reminder, order packed, shipment events, refund completed, follow-up, repeat offer).
- `triggerMessageAutomations` (fires from order/label/refund workflows) checks `enabled`,
  event/channel matches and consent, then dispatches. Enabled rule + transactional event ⇒ send.

## Follow-up tasks

- `FollowUpTask` (`merchant_id`, `customer_id`, `order_id`, `category`, `status`, `due_at`).
- `createFollowUpTask` (with `merchantId` from input) + `listFollowUpTasks` behind
  `GET /api/messages/follow-ups`; the messages panel's `FollowUpsPanel` maps `category →
  title/detail` via `KIND_LABELS`.
- `suggestFollowUps` proposes `FollowUpSuggestion`s for stale (**pending**) payment orders,
  deduplicating against existing open tasks; the route only accepts explicit
  `fromSuggestion` creation.

## Returns & refunds

- Returns: `createReturn` validates `quantity ≤ quantityOrdered`, gates on `orderStatus`,
  and enforces a transition map (`requested → approved` requires `approved` refund amount,
  `approved → received`, returns only when `received`). Returned quantity is non-negotiable —
  order status updates are blocked while an open return prevents shipping/fulfillment logic
  from double-processing items.
- Refunds: `initiateRefund` picks `providerRefundId` (else oldest eligible `pending`/`initiated`),
  caps at `refundableAmount`, markets status `initiated`. The **provider webhook**
  (`handleProviderRefundEvent`) marks `completed` with the provider refund id; `getRefundStatus`
  reads it back. `refundableAmount` for partials = total − sum of settled refunds.
- Order payment flows: an order is `refundable` only after payment settles; a return refund
  sets the return's status to `refunded` only after the refund completes.

## Inventory hooks

- `adjustInventory` (with `reason`/`actorUserId`) on `on_payment` deducts `quantityOrdered`;
  order **cancelled** status restores stock via `restoreStockForOrder` (idempotent, exceptions
  swallowed after the status transaction). `Manual` adjustments move stock; overselling is
  blocked when `stock.on_hand - quantity < 0` (reserved quantity is always honoured).

## Analytics

- `runOrderAnalytics({ merchantId, status?, from?, to?, groupBy })` computes:
  - `timeseries` — counts/revenue per day/week/month (`dateGroupKey/dateGroupLabel/toISO`);
  - `totals` — orders + revenue + units sold (all filtered by the eligible-money group);
  - `byStatus` — status funnel **over eligible orders only** (for `status: 'paid'` the
    money-received group, which includes `refunded`);
  - `topSKUs` — grouped by `skuSnapshot || productNameSnapshot` (manual orders store no SKU);
  - `topChannels` — by `OrderSource` (`manual_order | payment_link | website_api | instagram |
    whatsapp | imported | other`).
- `runMovement(from, to)` vs `runOrderAnalytics` reports deltas in orders/revenue.
- OrderItem reads use the correct Phase 4 fields (`productNameSnapshot`, `skuSnapshot`,
  `quantityOrdered`, `lineTotal`).

## Segments

- `SavedSegment` preset Json in `MerchantSettings.savedSegments` (validated on save, written
  via a `Prisma.InputJsonValue` cast).
- `evaluateSegment` widens the order query shape (selects `fullName`, maps to `name`,
  `email: string | null`) and returns consent flags for each member.
- `messageSegment(channel, eventType, templateName, includeOptedOut)` re-checks consent via
  `canSendToCustomer` (skip = `opted_out`/`no_marketing_consent`) unless bypassed, then sends a
  `manual_message` (the transactional ad-hoc event that has built-in bodies for **all**
  channels) and counts `sent` vs `failed` from `outcome.status` (`duplicate` is not a failure).

## Test suite

`tests/` add 15 Phase 4 integration tests (run with
`DATABASE_URL=postgresql://toropay:toropay@localhost:5433/toropay_test`; `tests/setup.ts`
truncates the Phase 4 tables):

| File | Covers |
| ---- | ------ |
| `messaging.test.ts`   | mock send + log, idempotency dedupe, promotional consent skip, encrypted channel creds + delivery receipt + disconnect, automations disabled-by-default → opt-in fires email send → retry of a failed log |
| `follow-ups.test.ts`  | task creation, stale pending-order suggestion, suggestion dedupe |
| `returns.test.ts`     | creation + quantity validation, approved→received transition, blocked invalid jumps |
| `refunds.test.ts`     | refund caps, initiate→(mock webhook)complete→return marked refunded |
| `inventory.test.ts`   | deduct on payment + restore on cancel, oversell block + manual adjust |
| `segments.test.ts`    | preset save/evaluate + consent-gated messaging, `includeOptedOut` bypass |
| `analytics.test.ts`   | buckets, status funnel, topSKUs (distinct SKU names), topChannels, date helpers, movement |

Full gates: `npx tsc --noEmit`, `npx next lint`, `npx vitest run`, `npx next build` —
all clean (only pre-existing lint warnings in older UI files remain).