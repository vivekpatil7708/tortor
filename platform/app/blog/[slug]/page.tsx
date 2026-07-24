import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BLOG_POSTS, getBlogPost } from '@/lib/blog-data'

type Props = { params: { slug: string } }

export function generateStaticParams() {
  return BLOG_POSTS.map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getBlogPost(params.slug)
  if (!post) return { title: 'Not Found' }
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `https://toropay.co.in/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://toropay.co.in/blog/${post.slug}`,
      siteName: 'ToroPay',
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  }
}

export default function BlogPostPage({ params }: Props) {
  const post = getBlogPost(params.slug)
  if (!post) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: { '@type': 'Organization', name: post.author },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    publisher: {
      '@type': 'Organization',
      name: 'ToroPay',
      url: 'https://toropay.co.in',
      logo: 'https://toropay.co.in/favicon.svg',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://toropay.co.in/blog/${post.slug}`,
    },
    keywords: post.tags.join(', '),
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/blog" className="text-sm font-medium text-gray-600 hover:text-charcoal">Blog</Link>
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-charcoal">Log in</Link>
          <Link href="/signup" className="rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Get started</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-32">
        <article className="pt-12">
          <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <Link href="/blog" className="font-medium text-primary-500 hover:underline">← Blog</Link>
            <span>·</span>
            <span className="rounded-md bg-primary-50 px-2 py-0.5 font-medium text-primary-600">{post.category}</span>
            <span>{post.readTime}</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{post.title}</h1>
          <p className="mt-4 text-lg text-gray-500">{post.description}</p>

          <div className="mt-4 flex items-center gap-3 text-sm text-gray-400">
            <span className="font-medium text-gray-600">{post.author}</span>
            <span>·</span>
            <time dateTime={post.publishedAt}>
              Published {new Date(post.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </time>
            {post.updatedAt !== post.publishedAt && (
              <>
                <span>·</span>
                <time dateTime={post.updatedAt}>
                  Updated {new Date(post.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </time>
              </>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-1.5">
            {post.tags.map(tag => (
              <span key={tag} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{tag}</span>
            ))}
          </div>

          <div className="prose prose-gray mt-10 max-w-none prose-headings:text-charcoal prose-a:text-primary-500 prose-strong:text-charcoal prose-table:text-sm prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2 prose-td:px-4 prose-td:py-2 prose-table:border prose-table:border-gray-200 prose-table:border-collapse prose-img:rounded-2xl"
            dangerouslySetInnerHTML={{ __html: post.content }} />

          <div className="mt-16 rounded-3xl bg-charcoal p-8 text-center text-white sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight">Ready to get started?</h2>
            <p className="mt-3 text-gray-300">Create free payment pages, links, and QR codes. Zero transaction fees.</p>
            <Link href="/signup" className="mt-6 inline-block rounded-xl bg-primary-500 px-8 py-3.5 text-base font-semibold text-white hover:bg-primary-600">
              Create free account
            </Link>
          </div>

          <div className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6">
            <Link href="/blog" className="text-sm font-medium text-primary-500 hover:underline">← Back to Blog</Link>
          </div>
        </article>
      </main>
    </div>
  )
}
