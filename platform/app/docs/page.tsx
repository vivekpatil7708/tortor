import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, FileText } from 'lucide-react'
import { MarketingPage, PageHero, Section } from '@/components/marketing/site-shell'
import { DOCS } from '@/lib/docs-content'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'ToroPay documentation: getting started, payment links, payment status, refunds, subscriptions, webhooks, the API and connecting an AI assistant.',
  alternates: { canonical: '/docs' },
  openGraph: {
    url: 'https://www.toropay.co.in/docs',
    title: 'ToroPay documentation',
    description: 'How ToroPay works, in plain language. Every page has a Markdown version.',
  },
}

const collectionSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'ToroPay documentation',
  url: 'https://www.toropay.co.in/docs',
  description:
    'Documentation for ToroPay: payment links, payment status, refunds, subscriptions, webhooks, the API and the MCP connector.',
  hasPart: DOCS.map(doc => ({
    '@type': 'TechArticle',
    headline: doc.title,
    description: doc.description,
    url: `https://www.toropay.co.in/docs/${doc.slug}`,
  })),
}

export default function DocsIndexPage() {
  return (
    <MarketingPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />

      <PageHero
        eyebrow="Documentation"
        title="The product, explained the way it is built."
        intro="Six pages cover the parts that matter: how money moves, what each status means, and what the API and AI connector can actually do. Each page also has a Markdown version for tools and assistants."
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          {DOCS.map((doc, index) => (
            <Link
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              className="group flex flex-col rounded-2xl border border-olive-leaf-800 bg-white p-6 transition-colors hover:border-copperwood"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-copperwood">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h2 className="mt-2 text-lg font-bold text-black-forest">{doc.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-olive-leaf-400">{doc.description}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-black-forest">
                Read the page <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section className="border-t border-olive-leaf-800">
        <div className="flex items-start gap-3 rounded-2xl border border-olive-leaf-800 bg-cornsilk-600 p-6">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-copperwood" aria-hidden />
          <div>
            <h2 className="text-base font-bold text-black-forest">Markdown versions</h2>
            <p className="mt-2 text-sm leading-relaxed text-olive-leaf-400">
              Add <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">.md</code> to any
              documentation URL for a plain Markdown copy. The copies are generated from the same
              source as the HTML pages, so they cannot drift.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-olive-leaf-400">
              Example:{' '}
              <Link href="/docs/getting-started.md" className="font-semibold text-copperwood underline underline-offset-2">
                /docs/getting-started.md
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section className="pb-20">
        <div className="rounded-3xl border border-olive-leaf-800 bg-white p-8 sm:p-10">
          <h2 className="text-xl font-bold tracking-tight text-black-forest">Not sure where to start?</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-olive-leaf-400">
            Read the payment status page first. It explains the one rule the whole product is built
            around: a direct UPI payment is only paid when the merchant confirms it.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/docs/payment-status" className="inline-flex items-center gap-2 rounded-full btn-blue-gradient px-5 py-2.5 text-sm font-semibold text-white">
              Payment status <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/how-payments-work" className="inline-flex items-center gap-2 rounded-full border border-olive-leaf-800 bg-white px-5 py-2.5 text-sm font-semibold text-black-forest hover:bg-cornsilk-600">
              How payments work
            </Link>
          </div>
        </div>
      </Section>
    </MarketingPage>
  )
}
