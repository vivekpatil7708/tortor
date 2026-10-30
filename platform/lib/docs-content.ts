/**
 * Public documentation content. One source is rendered as server-side HTML at
 * /docs/[slug] and as Markdown at /docs/[slug].md (see the rewrite in
 * next.config.js). Keep claims tied to the code in this repo.
 */

export type DocBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'code'; text: string }

export type DocSection = {
  heading: string
  blocks: DocBlock[]
}

export type Doc = {
  slug: string
  title: string
  description: string
  updated: string
  sections: DocSection[]
}

const p = (text: string): DocBlock => ({ kind: 'p', text })
const ul = (items: string[]): DocBlock => ({ kind: 'ul', items })
const code = (text: string): DocBlock => ({ kind: 'code', text })

export const DOCS: Doc[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'Create an account, add a UPI ID, make a payment link and complete the first payment.',
    updated: '2026-10-30',
    sections: [
      {
        heading: 'What you need',
        blocks: [
          p('A UPI ID linked to your bank account. ToroPay does not need your bank password, card details or a website.'),
          p('An email address for the account. Google sign-in is also supported.'),
        ],
      },
      {
        heading: '1. Create the account',
        blocks: [
          p('Sign up with an email address and password, or continue with Google. A verification email is sent before some account actions are allowed.'),
          p('The account belongs to a merchant. Team members can be invited later from Settings.'),
        ],
      },
      {
        heading: '2. Add your UPI ID',
        blocks: [
          p('Open the UPI IDs section and add the address where you want money to land, for example name@bank.'),
          p('ToroPay checks the format of the UPI ID. It does not verify that the bank account belongs to you - the money still goes to whichever account owns that UPI ID, so enter your own.'),
          p('You can mark one UPI ID as primary. Payment links can use any of your active UPI IDs.'),
        ],
      },
      {
        heading: '3. Create a payment link',
        blocks: [
          p('Give the link a title, a fixed amount (or allow the customer to choose), and optionally a description, custom fields, a use limit and an expiry date.'),
          p('For products, build an order form instead: add items, quantities, tax, shipping and a coupon. The server re-checks the amount before a transaction is created.'),
          p('Branding - logo and colours - is set once and appears on the hosted checkout.'),
        ],
      },
      {
        heading: '4. Share it',
        blocks: [
          ul([
            'Copy the link and send it on WhatsApp, Instagram, SMS or email.',
            'Download the QR code or print the poster for a counter or invoice.',
            'Embed the link anywhere that accepts a URL.',
          ]),
        ],
      },
      {
        heading: '5. Get paid and confirm',
        blocks: [
          p('The customer opens the link, sees your business name and amount, and pays inside their own UPI app. The money goes directly to your UPI ID.'),
          p('The customer then taps "I have paid". This is a claim, not a confirmation. Check your bank or UPI app and mark the payment paid. That is what advances the order.'),
          p('If the customer paid but never tapped the button, the payment stays Started (or becomes Abandoned after 30 minutes). You can still confirm it.'),
        ],
      },
      {
        heading: 'What happens automatically',
        blocks: [
          ul([
            'A confirmation awards loyalty points and can export the row to Google Sheets, if enabled.',
            'A subscribed webhook receives payment.confirmed or payment.rejected.',
            'The customer can receive an email (and WhatsApp, if early access is enabled and a phone number is saved).',
          ]),
        ],
      },
    ],
  },
  {
    slug: 'payment-links',
    title: 'Payment links',
    description: 'Amounts, reuse, use limits, expiry, custom fields, QR codes and templates.',
    updated: '2026-10-30',
    sections: [
      {
        heading: 'Fixed and flexible amounts',
        blocks: [
          p('A fixed-amount link always charges the amount you set. A flexible link lets the customer enter the amount, which is useful for donations, deposits and open invoices.'),
          p('With products on the link, the price is calculated from the selected items, quantities and any coupon. The browser-submitted amount must match the server-side calculation.'),
        ],
      },
      {
        heading: 'Reuse, use limits and expiry',
        blocks: [
          ul([
            'A normal link can be paid more than once, which suits a shop counter or a link in a bio.',
            'A use limit caps how many checkouts the link accepts. The last use is reserved inside a database transaction so two customers cannot both take it.',
            'An expiry date stops new checkouts after that moment. An expired link returns a clear error instead of a checkout page.',
          ]),
        ],
      },
      {
        heading: 'Custom fields',
        blocks: [
          p('Add fields such as order reference, size, delivery slot or notes. Their values are stored with the transaction and shown to the merchant.'),
          p('Product selections are stored separately so the amount can be verified.'),
        ],
      },
      {
        heading: 'QR codes and posters',
        blocks: [
          p('Each link has a QR code that opens the same checkout. The poster view adds the link title and a printable layout for a counter or invoice.'),
          p('The QR encodes the ToroPay checkout URL, not a raw UPI intent, so the customer still sees your branding and the amount is checked.'),
        ],
      },
      {
        heading: 'Templates',
        blocks: [
          p('Save a link setup as a template and reuse it for a recurring purpose without rebuilding the fields. Templates store the configuration, not the transactions.'),
        ],
      },
      {
        heading: 'What a link does not do',
        blocks: [
          p('It does not subscribe the customer, auto-debit them, or reserve stock by itself. Inventory rules, if enabled, run when a payment or fulfilment event fires.'),
        ],
      },
    ],
  },
  {
    slug: 'payment-status',
    title: 'Payment status',
    description: 'Every status in plain words, the allowed transitions, and who can mark a payment as received.',
    updated: '2026-10-30',
    sections: [
      {
        heading: 'Two pipelines',
        blocks: [
          p('Direct UPI payment links use a merchant-confirmed status. Hosted provider checkouts use a signed webhook. The two are intentionally separate.'),
        ],
      },
      {
        heading: 'Direct UPI statuses',
        blocks: [
          ul([
            'Started (stored as initiated): the checkout was opened, but the customer has not said they paid.',
            'Abandoned (stored as initiated, older than 30 minutes): the customer did not finish in the hold window. It can still be confirmed if money arrived.',
            'Customer says paid (stored as pending): the customer tapped "I have paid". This is a claim, not proof.',
            'Paid (stored as success): the merchant confirmed the money arrived.',
            'Rejected (stored as failed): the merchant marked it not received. A late arrival can still be confirmed as paid.',
          ]),
        ],
      },
      {
        heading: 'Who can change what',
        blocks: [
          ul([
            'A customer can only move a Started payment to Customer says paid. They cannot settle a payment.',
            'The owning merchant can confirm a payment and can undo a confirmation for 30 minutes.',
            'An API key or OAuth token with write scope can do the same through the v1 API.',
            'A signed provider webhook can settle a provider checkout, never a direct UPI link.',
          ]),
        ],
      },
      {
        heading: 'Provider checkout statuses',
        blocks: [
          p('A provider payment moves pending -> processing -> paid, failed or expired. Once paid it can only move to partially_refunded, refunded or disputed.'),
          p('Webhook events are stored by provider event id, so a duplicate delivery is ignored. The amount is checked against the order; a mismatch is flagged for review instead of being applied silently.'),
          p('Late or out-of-order provider messages never move a payment backwards.'),
        ],
      },
      {
        heading: 'What fires when the status changes',
        blocks: [
          p('A merchant webhook is dispatched for payment.confirmed and payment.rejected. Loyalty points are awarded on success and reversed when a success is undone. Subscription history is updated when the linked transaction settles.'),
        ],
      },
      {
        heading: 'What never happens',
        blocks: [
          p('ToroPay does not mark a direct UPI payment paid on its own, does not read your bank account, does not move refunds and does not auto-debit subscriptions.'),
        ],
      },
    ],
  },
  {
    slug: 'refunds-and-subscriptions',
    title: 'Refunds and subscriptions',
    description: 'Refund records versus refunded money, and reminder-based subscription billing.',
    updated: '2026-10-30',
    sections: [
      {
        heading: 'Refunds are records, not transfers',
        blocks: [
          p('UPI refunds happen in the merchant\u2019s own UPI app. ToroPay records what you promised to refund, the amount, the reason and when you mark it sent. It does not contact a payment provider and does not move money.'),
          p('A refund can be linked to an order or a transaction. You cannot record more than the paid amount, and a fully refunded payment cannot be refunded again.'),
        ],
      },
      {
        heading: 'Refund states',
        blocks: [
          ul([
            'Pending: recorded, not sent yet.',
            'Processed: the merchant marked it sent.',
            'Failed: the attempt is recorded as failed.',
          ]),
        ],
      },
      {
        heading: 'Recording a refund',
        blocks: [
          p('Use the Refunds page in the dashboard, or POST /api/v1/refunds with an API key or token that has write scope. Listing refunds requires read scope.'),
          p('When a refund is recorded, the customer can be notified by email or WhatsApp if their contact is saved.'),
        ],
      },
      {
        heading: 'Subscriptions are reminder links',
        blocks: [
          p('A plan has a frequency (weekly, monthly or yearly) and a billing day. A daily job creates a fresh one-time payment link for each due cycle.'),
          p('There is no mandate, eNACH, UPI AutoPay or stored credential. The customer pays each cycle like any other UPI payment.'),
          p('If the job misses a few cycles, skipped periods are not billed retroactively. The schedule resumes at the next future date.'),
        ],
      },
      {
        heading: 'Cancelling',
        blocks: [
          p('A customer can cancel from a tokenized cancel link. Cancelling stops future links; it does not refund past payments.'),
        ],
      },
    ],
  },
  {
    slug: 'webhooks',
    title: 'Webhooks',
    description: 'Event names, signature verification, retries, idempotency and the delivery log.',
    updated: '2026-10-30',
    sections: [
      {
        heading: 'Setup',
        blocks: [
          p('Create an endpoint in Dashboard -> Developers. The URL must be public HTTPS. Private, loopback and reserved addresses are refused at save time and again at delivery.'),
          p('The signing secret is shown once when the endpoint is created. Store it like a password; it is not shown again.'),
        ],
      },
      {
        heading: 'Events',
        blocks: [
          ul([
            'order.created, order.paid, order.updated',
            'payment.confirmed, payment.rejected',
            'payment.paid, payment.failed (legacy names kept for existing integrations)',
            'payment_link.created',
            'customer.created',
            'fulfillment.created, fulfillment.shipped, fulfillment.delivered',
          ]),
          p('Subscribe to specific events or to * for all of them.'),
        ],
      },
      {
        heading: 'Payload and signature',
        blocks: [
          p('Every delivery is a JSON object with id, type, created_at and data. Retries reuse the same body and the same id.'),
          p('The X-ToroPay-Signature header is the hex HMAC-SHA256 of the raw request body using your endpoint secret. The X-ToroPay-Event header repeats the event type.'),
          code('X-ToroPay-Event: payment.confirmed\nX-ToroPay-Signature: <hex hmac-sha256>\n\n{ "id": "evt_...", "type": "payment.confirmed", "created_at": "...", "data": { ... } }'),
          p('Verify the signature against the raw body before parsing it. Compare in constant time.'),
        ],
      },
      {
        heading: 'Retries and idempotency',
        blocks: [
          p('A failed delivery is retried after 1, 5, 30, 120, 360 and 1440 minutes. After the sixth attempt it is marked failed. Retries older than 48 hours are skipped.'),
          p('Treat every delivery as retryable and idempotent: dedupe on the payload id. A redirect is treated as a failed delivery, so point the endpoint at the final URL.'),
        ],
      },
      {
        heading: 'Delivery log',
        blocks: [
          p('Dashboard -> Developers -> Webhook logs shows the event, response code, attempt count and the next retry time. The signing secret is never shown there.'),
        ],
      },
      {
        heading: 'Security notes',
        blocks: [
          ul([
            'Only HTTPS endpoints are accepted.',
            'Redirects are not followed, which prevents a signer from being bounced to another host.',
            'A response body is read up to 2,000 characters and then discarded.',
            'Deliveries time out after 10 seconds.',
          ]),
        ],
      },
    ],
  },
  {
    slug: 'api-and-mcp',
    title: 'API and MCP',
    description: 'API keys, scopes, the v1 endpoints, and connecting an AI assistant through OAuth.',
    updated: '2026-10-30',
    sections: [
      {
        heading: 'API keys',
        blocks: [
          p('Create a test or live key in Dashboard -> Developers. The raw key is shown once; only a hash is stored. A revoked or expired key stops working immediately.'),
          p('Send it as Authorization: Bearer tp_test_... or tp_live_.... Test keys can only act on the test workspace. A live key works in live mode.'),
        ],
      },
      {
        heading: 'Scopes',
        blocks: [
          ul([
            'read: list transactions, links, orders, analytics, refunds, subscriptions and loyalty.',
            'write: create links and orders, confirm or reject payments, and record refunds.',
          ]),
          p('A request that needs a scope the credential does not have returns 403.'),
        ],
      },
      {
        heading: 'Mode header',
        blocks: [
          p('x-toropay-mode: test or live selects the workspace. API keys are bound to their own mode; test keys can never act on live data.'),
        ],
      },
      {
        heading: 'v1 endpoints',
        blocks: [
          ul([
            'GET /api/v1/transactions',
            'POST /api/v1/transactions/{id}/confirm',
            'POST /api/v1/transactions/{id}/reject',
            'GET/POST /api/v1/orders, GET /api/v1/orders/{id}, GET /api/v1/orders/{id}/payment-status',
            'GET/POST /api/v1/links',
            'GET/POST /api/v1/refunds',
            'GET/POST /api/v1/subscriptions',
            'GET/POST /api/v1/coupons',
            'GET /api/v1/loyalty/{customer_id}',
            'GET /api/v1/analytics',
          ]),
          p('Requests are logged with the route, status, duration and (for OAuth) the token owner.'),
        ],
      },
      {
        heading: 'Connecting an AI assistant (MCP)',
        blocks: [
          p('ToroPay exposes an OAuth 2.0 authorization server for the external ToroPay MCP connector. In Settings -> Connected apps, add the MCP URL shown there (https://toropay-mcp.vercel.app/mcp) to your AI client and sign in with your ToroPay account.'),
          p('The consent screen lists the scopes. read lets the assistant see transactions, links and analytics. write lets it create and confirm payments on your behalf.'),
          p('Access tokens last 30 days and can be revoked from Connected apps at any time. Revoking takes effect immediately.'),
        ],
      },
      {
        heading: 'Before you grant write access',
        blocks: [
          ul([
            'A write-scoped assistant can confirm a payment as received, create an order marked paid, and record a refund.',
            'It can act on the live workspace, not only test data.',
            'Every change is audit-logged and can fire your webhooks.',
            'Grant write only to an assistant you trust with payment records.',
          ]),
        ],
      },
      {
        heading: 'What this repository does not contain',
        blocks: [
          p('The MCP server itself is a separate deployment. This repository contains the OAuth endpoints, tokens, scopes and the v1 API the assistant calls. The assistant\u2019s own tool list and prompts are outside this codebase.'),
        ],
      },
    ],
  },
]

export function getDoc(slug: string): Doc | undefined {
  return DOCS.find(doc => doc.slug === slug)
}

export function docToMarkdown(doc: Doc): string {
  const lines: string[] = [`# ${doc.title}`, '', `> ${doc.description}`, '', `_Updated ${doc.updated}_`, '']
  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, '')
    for (const block of section.blocks) {
      if (block.kind === 'p') lines.push(block.text, '')
      if (block.kind === 'ul') {
        for (const item of block.items) lines.push(`- ${item}`)
        lines.push('')
      }
      if (block.kind === 'code') {
        lines.push('```http', block.text, '```', '')
      }
    }
  }
  lines.push('---', '', `Source: https://www.toropay.co.in/docs/${doc.slug}`, '')
  return lines.join('\n')
}
