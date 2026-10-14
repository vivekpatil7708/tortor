# Project description

Toropay is a merchant payments platform where merchants create orders and customers pay by UPI QR code or a shareable payment link. It is built with Next.js 14 (App Router), Prisma 5.22 and Supabase. The code repo is named "tortor".
## Main folders

- `app/` - Next.js App Router pages and API routes
- `components/` - React components
- `lib/` - Utility functions, helpers, and core business logic (e.g., orders, payments)
- `prisma/` - Prisma schema and migrations/seed data
- `supabase/` - Supabase-related configuration and utilities
- `types/` - TypeScript type definitions
- `tests/` - Test files (Vitest)
- `docs/` - Documentation files
- `public/` - Static assets

## Key libraries with exact versions

- **Next.js**: ^14.2.0 (React 18.3.0, React DOM 18.3.0)
- **@prisma/client**: ^5.22.0, **prisma**: ^5.22.0
- **zod**: ^3.25.76 (schema validation)
- **jose**: ^5.9.6 (JWT/auth)
- **bcryptjs**: ^2.4.3 (password hashing)
- **tailwindcss**: ^3.4.0 with tailwind-merge ^2.5.0, clsx ^2.1.1
- **vitest**: ^2.1.9 (testing)
- **resend**: ^6.12.4 (email)
- **qrcode**: ^1.5.4
- **recharts**: ^3.10.0 (charts)
- **nanoid**: ^5.0.0
- **lucide-react**: ^0.400.0
- **TypeScript**: ^5.5.0, @types/node ^20.14.0, etc.

## Library docs (Context7)
- When writing or changing code that uses an external library or framework,
  first use the Context7 tools to look up the current docs.
- Always read the exact version from package.json and put it in the query text,
  for example "Prisma Client 5.22". Context7 returns the newest docs by default.
- If the results look like a different major version than package.json, say so
  and try again with the version in the query.
- For payment, authentication, or webhook code, remind me to verify the result
  against the official docs before I use it.
- Never put API keys, secrets, .env values, or customer data in Context7 queries.
- Never open, read, or print .env files or any file containing API keys,
  payment credentials, or webhook secrets.
- Skip Context7 for simple tasks that don't involve an external library.