# ToroPay — UPI Payment Platform for India

White-label SaaS for creating branded UPI payment links, QR codes, and hosted checkout pages using your own merchant UPI ID.

## Quick start

```bash
cd platform
npm install
npm run setup    # creates SQLite DB + demo account
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

- Merchant signup, login, onboarding wizard
- Multiple UPI IDs with verify & primary selection
- Branded hosted checkout (`/pay/[slug]`)
- Fixed or flexible amounts, custom fields
- UPI deep links (GPay, PhonePe, Paytm, BHIM, etc.)
- Server-generated QR codes
- Transaction tracking with merchant confirm/reject
- Webhook callbacks with HMAC signing
- Payment templates, analytics dashboard
- API keys (Pro/Growth plans)
- Pricing page with Free / Pro / Growth tiers

## Stack

- **Frontend:** Next.js 14, React, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** SQLite via Prisma (swap to PostgreSQL for production)
- **Auth:** JWT sessions (httpOnly cookies)

## Environment

Copy `.env.example` to `.env`:

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-this-to-a-long-random-string"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Optional integrations for production:

- `SETU_CLIENT_ID` / `SETU_CLIENT_SECRET` — VPA validation
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — automated payment confirmation

## Production deployment

1. Switch Prisma datasource to PostgreSQL
2. Set strong `JWT_SECRET`
3. Deploy to Vercel/Railway with persistent DB
4. Connect Setu or Razorpay for auto payment verification

## Project structure

```
platform/
├── app/                  # Next.js pages & API routes
├── components/           # UI components
├── lib/                  # Auth, DB, UPI, webhooks
├── prisma/               # Schema & seed
└── supabase/migrations/  # Legacy PostgreSQL schema (reference)
```

## API overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/signup` | Create merchant |
| `POST /api/auth/login` | Login |
| `GET /api/links` | List payment links |
| `POST /api/transactions` | Initiate payment |
| `PATCH /api/transactions/[txnId]` | Update status |
| `GET /api/qr` | Generate UPI QR PNG |
| `POST /api/webhooks` | Internal status webhook |

## License

Private — ToroPay MVP
