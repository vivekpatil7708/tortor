import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BLOG_POSTS, getBlogPost, getRelatedPosts } from '@/lib/blog-data'
import BlogNavbar from '@/components/blog/BlogNavbar'
import BlogFooter from '@/components/blog/BlogFooter'
import AuthorBlock from '@/components/blog/AuthorBlock'
import ShareButtons from '@/components/blog/ShareButtons'
import CTABanner from '@/components/blog/CTABanner'
import RelatedPosts from '@/components/blog/RelatedPosts'
import TableOfContents from '@/components/blog/TableOfContents'
import ReadingProgress from '@/components/blog/ReadingProgress'
import TagChip from '@/components/blog/TagChip'

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
      authors: [post.author.name],
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

  const related = getRelatedPosts(post, 3)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: { '@type': 'Person', name: post.author.name },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    publisher: {
      '@type': 'Organization',
      name: 'ToroPay',
      url: 'https://toropay.co.in',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://toropay.co.in/blog/${post.slug}`,
    },
    keywords: post.tags.join(', '),
  }

  const formattedDate = new Date(post.publishedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ReadingProgress />
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-6">
        <article className="mx-auto max-w-[680px] pt-12 sm:pt-16">
          {/* Header */}
          <header>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Link href={`/blog/category/${post.category.toLowerCase()}`} className="font-medium text-primary-600 transition-colors hover:text-primary-700">
                {post.category}
              </Link>
              <span>·</span>
              <time dateTime={post.publishedAt}>{formattedDate}</time>
              <span>·</span>
              <span>{post.readTime}</span>
            </div>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-4xl lg:text-[2.75rem]">
              {post.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-gray-500">{post.excerpt}</p>

            <AuthorBlock author={post.author} date={post.publishedAt} readTime={post.readTime} />
          </header>

          {/* Content */}
          <div
            className="prose mt-10 max-w-none
              prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-gray-900
              prose-h2:mt-12 prose-h2:text-2xl
              prose-h3:mt-8 prose-h3:text-lg
              prose-p:my-4 prose-p:text-[17px] prose-p:leading-[1.8] prose-p:text-gray-700
              prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-gray-900
              prose-li:my-1.5 prose-li:text-[17px] prose-li:leading-[1.8] prose-li:text-gray-700
              prose-table:my-8 prose-table:text-sm
              prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:uppercase prose-th:tracking-wider prose-th:text-gray-500
              prose-td:px-4 prose-td:py-2.5 prose-td:text-gray-600
              prose-table:border prose-table:border-gray-200 prose-table:border-collapse prose-table:rounded-lg prose-table:overflow-hidden
              prose-blockquote:border-l-2 prose-blockquote:border-gray-900 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-gray-500
              prose-code:text-sm prose-code:bg-gray-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-gray-800 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:border prose-pre:border-gray-200
              max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Tags */}
          <div className="mt-12 flex flex-wrap gap-2">
            {post.tags.map(tag => (
              <TagChip key={tag} tag={tag} />
            ))}
          </div>

          {/* Share + Footer */}
          <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6">
            <ShareButtons title={post.title} slug={post.slug} />
            <Link href="/blog" className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-900">
              All articles
            </Link>
          </div>

          {/* CTA */}
          <CTABanner />

          {/* Related */}
          <RelatedPosts posts={related} />
        </article>
      </main>

      {/* Sidebar TOC - desktop only */}
      <div className="fixed right-8 top-24 hidden w-56 xl:block">
        <TableOfContents content={post.content} />
      </div>

      <div className="mt-20">
        <BlogFooter />
      </div>
    </div>
  )
}
