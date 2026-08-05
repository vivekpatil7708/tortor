import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { BLOG_POSTS, getBlogCategories, getBlogAuthors } from '@/lib/blog-data'
import BlogNavbar from '@/components/blog/BlogNavbar'
import BlogFooter from '@/components/blog/BlogFooter'
import FeaturedArticle from '@/components/blog/FeaturedArticle'
import ArticleCard from '@/components/blog/ArticleCard'
import AuthorCard from '@/components/blog/AuthorCard'
import SearchBar from '@/components/blog/SearchBar'

export const metadata: Metadata = {
  title: 'Blog — ToroPay',
  description: 'Guides, comparisons, and tips for Indian businesses on UPI payments, payment links, and digital payment strategies.',
  alternates: { canonical: 'https://www.toropay.co.in/blog' },
}

export default function BlogPage() {
  const categories = getBlogCategories()
  const authors = getBlogAuthors()
  const featured = BLOG_POSTS.find(p => p.featured)
  const remaining = BLOG_POSTS.filter(p => p.slug !== featured?.slug)

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero Header */}
        <section className="pt-16 pb-8 sm:pt-20 sm:pb-10">
          <div className="flex flex-col items-start gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-600">
              The ToroPay Journal
            </span>
          </div>
          <h1 className="mt-4 font-serif text-4xl font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-5xl">
            Insights for Indian businesses
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-gray-500">
            Guides, comparisons, and tips on UPI payments, payment links, and digital payment strategies.
          </p>
          <div className="mt-6 max-w-md">
            <SearchBar />
          </div>
        </section>

        {/* Featured Article - Large Hero */}
        {featured && (
          <section className="pb-10">
            <div className="group relative overflow-hidden rounded-2xl bg-white shadow-sm transition-all hover:shadow-md">
              <div className="relative h-64 w-full sm:h-80 lg:h-[420px]">
                <Image
                  src={featured.imageUrl}
                  alt={featured.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="100vw"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="rounded-full bg-primary-500 px-3 py-0.5 font-semibold text-white">
                      Featured
                    </span>
                    <Link
                      href={`/blog/category/${featured.category.toLowerCase()}`}
                      className="font-medium text-white/80 transition-colors hover:text-white"
                    >
                      {featured.category}
                    </Link>
                    <span className="text-white/40">·</span>
                    <span className="text-white/60">{featured.readTime}</span>
                  </div>
                  <h2 className="mt-3 font-serif text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
                    <Link href={`/blog/${featured.slug}`} className="transition-colors hover:text-primary-300">
                      {featured.title}
                    </Link>
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
                    {featured.excerpt}
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/50">
                      <svg className="h-full w-full text-white/60" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-white/90">{featured.author.name}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Articles Section */}
        <section className="py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-2xl font-bold tracking-tight text-gray-900">
              Latest articles
            </h2>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <Link
                  key={cat}
                  href={`/blog/category/${cat.toLowerCase()}`}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-gray-500 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50 hover:text-gray-900 hover:ring-gray-300"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {remaining.map(post => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
        </section>

        {/* Authors Section */}
        {authors.length > 0 && (
          <section className="border-t border-gray-200 py-14">
            <h2 className="font-serif text-2xl font-bold tracking-tight text-gray-900">
              Meet the writers
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {authors.map(author => (
                <AuthorCard
                  key={author.slug}
                  author={author}
                  postCount={BLOG_POSTS.filter(p => p.author.slug === author.slug).length}
                />
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-gray-200 py-16">
          <div className="mx-auto max-w-xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-600">
              Get Started
            </span>
            <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-gray-900">
              Free UPI payments for your business
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-500">
              Zero transaction fees. Branded payment pages. Instant settlement. No KYC required.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800">
                Create free account
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
              <Link href="/login" className="rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-900">
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <BlogFooter />
    </div>
  )
}
