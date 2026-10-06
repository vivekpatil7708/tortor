# ToroPay QA plan

How ToroPay is tested before and after every release: the automated tests, a manual checklist,
the critical payment cases, and the release checklist. Keep it up to date when a flow changes.

## Automated tests

| Suite | What it covers | Run it |
|---|---|---|
| Unit and route tests (`lib/*.test.ts`) | Logic and API routes with a stand-in database: payment rules, sign-in hardening, webhooks, amounts, dates | `npm test` |
| Database tests (`tests/db/*.db.test.ts`) | Real Postgres: payment-link lifecycle, two requests at once, provider webhooks, website-checkout API, schema health check | `npm run test:db` (needs a local Postgres, below) |

Both run on every push in GitHub Actions ("Checks"), together with the type check and a production build.

### Running the database tests locally

They empty every table, so `scripts/test-db.mjs` and `tests/db/setup.ts` refuse any database that is
not on `localhost`, and blank every real key (email, payment providers, messaging) before Prisma can
read `.env`. Production data is never used: the tables are built from `prisma/schema.prisma`.

```sh
docker run -d --name toropay-test-db -e POSTGRES_PASSWORD=toropay_test -e POSTGRES_DB=toropay_test -p 127.0.0.1:55432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgresql://postgres:toropay_test@127.0.0.1:55432/toropay_test npm run test:db
docker rm -f toropay-test-db   # when finished
```

Login, `after()` work and webhook sending are faked in `tests/db/setup.ts`, so nothing leaves the machine.

### What the database tests can't see

They build a fresh database from the schema, so they can't notice that *production* is missing a
column (the 6 October outage). Two things cover that: `/api/health` (checked after every deploy and
every 10 minutes by GitHub Actions) and the release checklist's rule to run SQL in Neon first. A
pre-deploy check that compares production's schema with `schema.prisma` is a proposed follow-up.

### Next tests to add

1. Done: real-database setup, schema and health check (`schema.db.test.ts`).
2. Done: payment-link lifecycle (`payment-link.db.test.ts`).
3. Done: races, meaning a double confirm, a link's last use, and a duplicate provider event (`races.db.test.ts`).
4. Done: provider webhook safety, covering signature, amount, database failure and retry (`provider-webhooks.db.test.ts`).
5. Done: website-checkout API, covering idempotency key, UPI confirm and cancel (`website-checkout.db.test.ts`).
6. Browser test (Playwright, a new dev dependency): the customer payment journey at phone size, including refresh and reject.
7. Browser tests: sign-up, onboarding and first link; "sign out other devices".
8. Merchant webhook delivery and retries against a local test server.
9. Analytics and exports on large data with Indian dates.
10. Unit tests for code without any yet: UPI link building, order and payment status rules, refunds and returns, stock deduction, message-template escaping, courier status mapping.

## Critical payment cases

| Case | Payment links (UPI, merchant confirms) | Website checkout and card providers | Automated by |
|---|---|---|---|
| Success | Merchant confirms; customer sees "confirmed" or the redirect page; one webhook and one alert email | Provider success: payment paid, order paid, merchant notified once | `payment-link.db`, `provider-webhooks.db`, `website-checkout.db` |
| Failure | Merchant rejects: "not confirmed" with Try again; undo within 30 minutes | Provider failure: payment failed, order unpaid, customer can retry | `payment-link.db`, `provider-webhooks.db`, `transaction-status-route` |
| Cancelled | No cancel button. An abandoned checkout frees its use after 30 minutes and counts as abandoned, not failed | The cancel page records nothing: the order stays unpaid and can still be paid | `link-uses`, `website-checkout.db` |
| Duplicate webhook | "I've paid" or Confirm twice: no second webhook | The same provider event twice, even at once, is processed once | `races.db`, `provider-webhooks` |
| Invalid signature | n/a | Refused (401) before anything is stored | `provider-webhooks.db` |
| Wrong amount | A changed amount in the browser is refused. The amount paid in the UPI app is checked by the merchant (the Confirm prompt says so) | A provider amount different from the order is flagged and not marked paid | `payment-link.db`, `provider-webhooks.db`, `link-amount` |
| Database write failure | A clear error, nothing half-saved | The webhook answers 500, the provider resends, and it's applied once | `provider-webhooks.db`, `checkout-status` |
| Retry safely | A refresh resumes the same payment; repeated taps or two tabs can't double-apply | The same `idempotency_key` gives the same order; repeating "I've paid" or confirm changes nothing | `pay-page`, `races.db`, `website-checkout.db` |

## Manual checklist

Use a ₹1 test link or test-mode API keys, and reject test payments afterwards.

**Payment links (merchant)**
- [ ] Fixed, flexible and product links show the right amount and UPI ID on the public page.
- [ ] ₹499.999 saves as ₹500; 0, negative amounts and amounts over ₹10,00,000 are refused.
- [ ] Flexible link: amounts below the minimum or above the maximum are refused at checkout.
- [ ] Deactivate shows "isn't accepting payments"; Activate opens it again; Delete shows "not found".

**Customer payment page**
- [ ] The QR code and the UPI app buttons open the right amount.
- [ ] Refreshing, or switching to the UPI app and back, keeps the same payment (same TXN number, no duplicate).
- [ ] "I've completed payment" shows "marked as sent", and the alert email arrives when alerts are on.
- [ ] Confirm: the customer sees "confirmed" (or the redirect page) within seconds. Reject: "not confirmed" with Try again.
- [ ] In airplane mode, "I've paid" shows an offline message and the button works again afterwards.

**Website checkout**
- [ ] An order created through the API with a test key shows the right items and total.
- [ ] Sending the same `idempotency_key` twice creates one order.
- [ ] UPI: "I've paid" puts the order under "awaiting your confirmation"; Confirm shows the success page, and the merchant's site sees "paid".
- [ ] Cancel shows the cancel page, the order stays unpaid, and paying later still works.

**Dashboard**
- [ ] Totals, success rate (paid ÷ paid + rejected) and abandoned count are right.
- [ ] Transactions:
  - status and date filters (Indian dates) work
  - Load more works
  - Export includes every match
  - a customer name like `=1+1` stays plain text in Excel
- [ ] Confirm, Reject and Undo (within 30 minutes) each ask first, then update the row.
- [ ] Analytics with "today to today" includes a payment made just after midnight.
- [ ] Settings, Branding and Messaging keep their values after a save and reload; the webhook secret is never wiped.
- [ ] API keys: create, revoke, and the Revoked tag appears.

**Sign-in and accounts**
- [ ] Sign-up enforces the password rules; the verification email arrives and works.
- [ ] A wrong password gives the same message every time; 5 failures block sign-in for a while.
- [ ] Google sign-in works for a new account and an existing one.
- [ ] Forgot password and reset signs out other devices.
- [ ] "Sign out other devices": the other browser lands on the login page with a message.
- [ ] Admin needs the admin email plus the authenticator code; "view as merchant" can't change anything.
- [ ] Onboarding goes business name, then UPI ID, then first link.

**Order status and delivery**
- [ ] An API order goes from unpaid to paid to shipment created, with updates on the Delivery page.
- [ ] A late or repeated courier update never moves the status backwards.
- [ ] The courier connection's Test button works with test credentials.

**Customer data and privacy**
- [ ] Another merchant's transaction or order address is refused.
- [ ] Public pages never show the merchant's login email or phone.
- [ ] A returning customer's details are reused only when both email and phone match.
- [ ] Exports contain only the merchant's own data.
- [ ] Deletion requests sent to support@toropay.co.in arrive and are handled within 30 days.

**Mobile screens** (Android Chrome, iPhone Safari, a 360px-wide screen)
- [ ] The payment page doesn't scroll sideways; the QR code, UPI buttons and "I've paid" are reachable with one thumb.
- [ ] GPay, PhonePe and Paytm open with the right amount, and returning resumes the payment.
- [ ] A link opened inside WhatsApp or Instagram can be paid and returned to.
- [ ] Dashboard: the menu, the transactions list and the confirm dialog are usable.

**Error handling**
- [ ] Errors are in plain language, with no technical codes.
- [ ] Expired, used-up, switched-off and unknown links each show the right page.
- [ ] When the connection drops, pages say "Couldn't load… try again" and never show an empty account.
- [ ] `/api/health` reports ok.

## Release checklist

Before pushing:
1. `npm run typecheck`, `npm test` and a local production build pass (check the exit codes), and
   `npm run test:db` passes when database code changed.
2. Database change? Run the SQL in **Neon (project toropay → branch production → database neondb)**
   first, and confirm it there. Keep changes additive: add things, don't rename or drop them.
3. New setting? Add it in Vercel (Production) before the code that needs it.
4. Read the diff for secrets, debug logging and unrelated changes.

After pushing:
5. Vercel shows the new commit "Ready" and serving; GitHub "Checks" passed.
6. `/api/health` is ok, and a live payment link loads.
7. No new error-level logs for 10–15 minutes.
8. Run the manual checklist section for whatever changed.
9. Something wrong? In Vercel, promote the previous deployment (an instant rollback), then investigate.
