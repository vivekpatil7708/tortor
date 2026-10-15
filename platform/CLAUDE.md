# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

ToroPay — white-label SaaS for Indian merchants to create branded **UPI payment links**, QR codes, and hosted checkout pages using their own merchant UPI ID. Money moves bank-to-bank via UPI; ToroPay does not hold funds.

App code lives in `platform/` (this directory). The git repo root is one level up.

## Stack

- **Framework:** Next.js 15 (App Router, canary) + React 19, TypeScript
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL via Prisma 5.22 (`@prisma/client`)
- **Auth:** JWT sessions in httpOnly cookies (`jose`)
- **Tests:** Vitest (`*.test.ts` co-located in `lib/`, plus `tests/`)
- **Deploy:** Vercel (`vercel.json`)

## Layout

```
platform/
├── app/            # Pages + API routes (app/api/**)
├── components/     # UI components
├── lib/            # Domain logic (auth, payments, inventory, webhooks, ...)
├── prisma/         # schema.prisma, migrations, seed.ts
├── tests/          # Test suites (incl. tests/db)
├── docs/           # Planning/QA docs
└── supabase/       # Legacy PostgreSQL schema (reference only)
```

## Commands

```bash
npm run dev          # next dev
npm run build        # prisma generate && next build
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:db      # db-backed tests
npm run db:push      # prisma db push
npm run db:seed      # seed
npm run setup        # db push + seed
```

Always finish a change with `npm run typecheck` and `npm test`.

## Security rules (strict)

- **Never print credentials or full connection strings.** Redact passwords. Show only host and database name (e.g. `localhost` / `toropay_dev`).
- **Never touch production data, live API keys, or real secrets in `.env*` files.** Use local/test/sandbox resources only.
- **Before any Prisma or database command, confirm `DATABASE_URL` points at a local/dev database.** If it points anywhere else (staging, Neon, remote host), **STOP and ask** before proceeding.
- `.env*` files are gitignored — never commit them, never echo their contents, never copy secrets into code, logs, tests, or commit messages.
- Keep secrets server-side; only `NEXT_PUBLIC_*` values may reach the client.

## Conventions

- Match surrounding patterns, naming, and structure. Prefer editing existing modules over adding new abstractions.
- Keep changes small and reviewable. **One fix per PR, with tests.**
- Add/extend a `*.test.ts` next to the code you change.
- API responses use the helpers in `lib/api-response.ts`; request validation uses `zod`.
- Do not reformat or refactor unrelated files.

## Tooling notes

- MCP servers (see `.mcp.json`): `playwright`, `shopify-dev`.
- **Prisma MCP is intentionally not configured.** The bundled `prisma mcp` subcommand does not exist in Prisma 5.22.0; it requires Prisma >= 6.x. Use the CLI instead: `npx prisma validate`, `npx prisma migrate status`, `npx prisma studio`.
- Deferred work being tracked separately: Prisma upgrade to 6.x (to re-enable `prisma mcp`), and production hardening of rate limiting (`lib/rate-limit.ts` currently counts attempts in the `audit_logs` table).
