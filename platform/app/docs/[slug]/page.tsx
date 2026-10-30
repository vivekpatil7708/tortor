import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import { MarketingPage, Section } from '@/components/marketing/site-shell'
import { DOCS, getDoc } from '@/lib/docs-content'

const BASE = 'https://www.toropay.co.in'

export function generateStaticParams() {
  return DOCS.map(doc => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = getDoc((await params).slug)
  if (!doc) return { title: 'Documentation' }

  return {
    title: doc.title,
    description: doc.description,
    alternates: {
      canonical: `/docs/${doc.slug}`,
      types: { 'text/markdown': `/docs/${doc.slug}.md` },
    },
    openGraph: {
      url: `${BASE}/docs/${doc.slug}`,
      title: `${doc.title} | ToroPay documentation`,
      description: doc.description,
      type: 'article',
    },
  }
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) notFound()

  const index = DOCS.findIndex(item => item.slug === doc.slug)
  const previous = index > 0 ? DOCS[index - 1] : null
  const next = index < DOCS.length - 1 ? DOCS[index + 1] : null

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: doc.title,
    description: doc.description,
    dateModified: doc.updated,
    url: `${BASE}/docs/${doc.slug}`,
    mainEntityOfPage: `${BASE}/docs/${doc.slug}`,
    author: { '@type': 'Organization', name: 'ToroPay', url: BASE },
    publisher: { '@type': 'Organization', name: 'ToroPay', url: BASE },
    inLanguage: 'en-IN',
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Documentation', item: `${BASE}/docs` },
      { '@type': 'ListItem', position: 3, name: doc.title, item: `${BASE}/docs/${doc.slug}` },
    ],
  }

  return (
    <MarketingPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <div className="border-b border-olive-leaf-800 bg-cornsilk-600">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
          <Link href="/docs" className="inline-flex items-center gap-1.5 font-medium text-olive-leaf-400 hover:text-black-forest">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All documentation
          </Link>
          <Link
            href={`/docs/${doc.slug}.md`}
            className="inline-flex items-center gap-1.5 rounded-full border border-olive-leaf-800 bg-white px-3 py-1.5 text-xs font-semibold text-black-forest hover:bg-cornsilk-600"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden /> Markdown
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-wider text-olive-leaf-400">Documentation</p>
          <nav className="mt-3 space-y-1" aria-label="Documentation">
            {DOCS.map(item => {
              const active = item.slug === doc.slug
              return (
                <Link
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm ${
                    active
                      ? 'bg-white font-semibold text-black-forest shadow-sm'
                      : 'text-olive-leaf-400 hover:bg-white/70 hover:text-black-forest'
                  }`}
                >
                  {item.title}
                </Link>
              )
            })}
          </nav>
        </aside>

        <article>
          <p className="text-sm font-medium text-olive-leaf-400">
            Updated{' '}
            <time dateTime={doc.updated}>
              {new Date(`${doc.updated}T00:00:00Z`).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </time>
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-black-forest sm:text-4xl">
            {doc.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-olive-leaf-400">{doc.description}</p>

          <div className="mt-10 space-y-10">
            {doc.sections.map(section => (
              <section key={section.heading} aria-labelledby={section.heading}>
                <h2 id={section.heading} className="text-xl font-bold tracking-tight text-black-forest">
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-4">
                  {section.blocks.map((block, blockIndex) => {
                    if (block.kind === 'p') {
                      return (
                        <p key={blockIndex} className="text-[15px] leading-relaxed text-olive-leaf-400">
                          {block.text}
                        </p>
                      )
                    }
                    if (block.kind === 'ul') {
                      return (
                        <ul key={blockIndex} className="space-y-2 text-[15px] leading-relaxed text-olive-leaf-400">
                          {block.items.map(item => (
                            <li key={item} className="flex gap-2.5">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-copperwood" aria-hidden />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      )
                    }
                    return (
                      <pre
                        key={blockIndex}
                        className="overflow-x-auto rounded-2xl border border-olive-leaf-800 bg-ink p-4 text-xs leading-relaxed text-gray-200"
                      >
                        <code>{block.text}</code>
                      </pre>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <nav className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-olive-leaf-800 pt-6" aria-label="Documentation pagination">
            {previous ? (
              <Link href={`/docs/${previous.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-black-forest hover:text-copperwood">
                <ArrowLeft className="h-4 w-4" aria-hidden /> {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/docs/${next.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-black-forest hover:text-copperwood">
                {next.title} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </article>
      </div>
    </MarketingPage>
  )
}
