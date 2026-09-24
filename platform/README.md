# ToroPay — UPI + Commerce Platform for India

White-label SaaS for Indian merchants: branded UPI payment links, QR codes, hosted checkout, plus a full order-management backend (customers, products, orders, split-shipment fulfillments, and public tracking).

## Quick start

```bash
cd platform
npm install
npm run setup    # applies schema + seeds demo data (PostgreSQL)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo account

| Field | Value |
|-------|-------|
| Email | `demo@toropay.in` |
| Password | `demo123` |
| Sample checkout | [/pay/demo-booking](http://localhost:3000/pay/demo-booking) |

## Features

### Payments (existing)
- Merchant signup, login, onboarding wizard
- Multiple UPI IDs with verify & primary selection
- Branded hosted checkout (`/pay/[slug]`), UPI deep links, server-generated QR codes
- Transaction tracking with merchant confirm/reject, HMAC webhooks, templates, analytics, API keys

### Commerce (Phase 1)
- **Customers** — create/manage customer profiles + saved addresses
- **Products** — catalog of physical/digital products with pricing & stock
- **Orders** — manual order creation, computed totals, order lifecycle statuses
- **Fulfillments & split shipments** — split an order across multiple shipping fulfillments, each with its own packages
- **Tracking** — add tracking numbers + courier per package, record shipment events, per-package status flow
- **Order fulfillment summary** — automatic per-order aggregation (`unfulfilled` → `fulfilled` → `delivered`, `partially_fulfilled`, over-fulfillment guardrails)
- **Tenant isolation** — every service query is scoped to the logged-in merchant; cross-tenant access is forbidden and tested
- **Public tracking page** — [/track/[orderNumber]](http://localhost:3000/track/[orderNumber]) secured by a secret token on the order

## Stack

- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS
- **Backend:** Next.js API routes + server actions
- **Database:** PostgreSQL via Prisma (local dev = Docker container on `localhost:5433`, all creds `toropay`; `toropay_test` DB used by the vitest suite)
- **Auth:** JWT sessions (httpOnly cookies), `lib/auth.ts` with jose
- **Validation:** Zod on all API routes (unified `zodMessage` errors)
- **Tests:** Vitest — 45 integration/unit tests across `tests/` (status transitions, fulfillment-summary aggregation, order lifecycle, split shipments, tenant isolation)

## Scripts

```json
"build":  "prisma generate && next build"
"dev":    "next dev",
"lint":   "next lint",
"typecheck": "tsc --noEmit",
"test":   "vitest run"
```

Run tests against the test DB:

```bash
$env:DATABASE_URL="postgresql://toropay:toropay@localhost:5433/toropay_test"; npx vitest run
```

## Environment

Copy `.env.example` to `.env`:

```
DATABASE_URL="postgresql://toropay:toropay@localhost:5433/toropay"
JWT_SECRET="change-this-to-a-long-random-string"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Production deployment

1. PostgreSQL already configured; set strong `JWT_SECRET`
2. Run `npx prisma db push` (or a migration) against your production DB
3. Deploy to Vercel/Railway with persistent DB
4. Connect Setu or Razorpay for automated payment verification

## Project structure

```
platform/
├── app/(dashboard)/dashboard/   # Overview, Orders, Customers, Products, Delivery
├── app/track/[orderNumber]/     # Public tracking page
├── app/pay/[slug]/              # Hosted checkout
├── components/                  # UI + shared components (ui/, dashboard/)
├── lib/                         # Auth, Prisma, orders, fulfillments, status, api client, formatting
├── prisma/                      # Schema (enums + commerce models) & seed
├── tests/                       # Vitest suite (status, fulfillment-summary, orders, fulfillments, tenant)
└── vitest.config.ts
```

## API overview (Phase 1)

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard/overview` | Sales metrics, recent orders, top products |
| `GET/POST /api/products` · `GET/PATCH /api/products/[id]` | Product catalog |
| `GET/POST /api/customers` · `GET/PATCH /api/customers/[id]` | Customers |
| `GET/POST /api/orders` · `GET/PATCH /api/orders/[id]` | Orders + status transitions |
| `POST /api/orders/[id]/fulfillments` | Create fulfillment (split-shipment aware) |
| `GET/PATCH /api/orders/[id]/fulfillments/[fid]/packages/[pid]` | Packages + tracking |
| `GET /api/track/[orderNumber]` | Public tracking lookup (token-secured) |
| `GET/PATCH /api/merchant/profile` | Store profile settings |

## License

Private — ToroPay MVP