import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { BLOG_POSTS, getBlogPost, getRelatedPosts, addHeadingIds } from '@/lib/blog-data'
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
      images: [{ url: post.imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [post.imageUrl],
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
    image: post.imageUrl,
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

  const contentHtml = addHeadingIds(post.content)

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ReadingProgress />
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <article className="mx-auto max-w-[740px] pt-16 sm:pt-20">
          {/* Header */}
          <header className="text-center sm:text-left">
            <div className="flex items-center justify-center gap-2.5 text-xs sm:justify-start">
              <Link
                href={`/blog/category/${post.category.toLowerCase()}`}
                className="rounded-full bg-primary-50 px-3.5 py-1 font-semibold tracking-wide text-primary-600 transition-colors hover:bg-primary-100"
              >
                {post.category}
              </Link>
              <span className="text-gray-300">·</span>
              <time dateTime={post.publishedAt} className="text-gray-400">{formattedDate}</time>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400">{post.readTime}</span>
            </div>

            <h1 className="mt-6 font-serif text-4xl font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-5xl lg:text-[3.25rem]">
              {post.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-gray-500 sm:text-xl">
              {post.excerpt}
            </p>

            <div className="mt-8">
              <AuthorBlock author={post.author} date={post.publishedAt} readTime={post.readTime} />
            </div>
          </header>

          {/* Hero Image */}
          <div className="relative mt-10 h-64 w-full overflow-hidden rounded-2xl sm:h-80 lg:h-96">
            <Image
              src={post.imageUrl}
              alt={post.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 740px"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
          </div>

          {/* Content with sidebar layout */}
          <div className="relative mt-12 flex gap-12">
            {/* Sidebar TOC - desktop */}
            <aside className="hidden w-52 shrink-0 xl:block">
              <div className="sticky top-28">
                <TableOfContents content={post.content} />
              </div>
            </aside>

            {/* Article body */}
            <div className="min-w-0 flex-1">
              <div
                className="prose max-w-none
                  font-serif text-[18px] leading-[1.8] text-gray-800
                  prose-headings:font-serif prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-gray-900
                  prose-h2:mt-14 prose-h2:text-3xl prose-h2:leading-tight
                  prose-h3:mt-10 prose-h3:text-xl prose-h3:leading-snug
                  prose-p:my-5 prose-p:text-[18px] prose-p:leading-[1.8] prose-p:text-gray-700
                  prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium
                  prose-strong:text-gray-900 prose-strong:font-semibold
                  prose-li:my-2 prose-li:text-[18px] prose-li:leading-[1.8] prose-li:text-gray-700
                  prose-ol:pl-6 prose-ul:pl-6
                  prose-table:my-10 prose-table:w-full prose-table:text-sm
                  prose-th:bg-gray-50 prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:text-xs prose-th:font-semibold prose-th:uppercase prose-th:tracking-wider prose-th:text-gray-500
                  prose-td:px-4 prose-td:py-3 prose-td:text-gray-600
                  prose-table:border prose-table:border-gray-200 prose-table:rounded-xl prose-table:overflow-hidden
                  prose-blockquote:not-italic prose-blockquote:border-l-[3px] prose-blockquote:border-primary-500 prose-blockquote:pl-6 prose-blockquote:py-1 prose-blockquote:pr-0 prose-blockquote:my-8 prose-blockquote:bg-primary-50/40 prose-blockquote:rounded-r-lg
                  prose-blockquote:p-4
                  prose-code:text-sm prose-code:bg-gray-100 prose-code:px-2 prose-code:py-0.5 prose-code:rounded-lg prose-code:text-gray-800 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:border prose-pre:border-gray-200 prose-pre:text-[15px]"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />

              {/* Tags */}
              <div className="mt-14 flex flex-wrap gap-2">
                {post.tags.map(tag => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </div>

              {/* Share */}
              <div className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6">
                <ShareButtons title={post.title} slug={post.slug} />
                <Link href="/blog" className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-900">
                  All articles →
                </Link>
              </div>

              {/* CTA */}
              <CTABanner />

              {/* Related */}
              <RelatedPosts posts={related} />
            </div>
          </div>
        </article>
      </main>

      <div className="mt-24">
        <BlogFooter />
      </div>
    </div>
  )
}
