import type { Metadata } from 'next'
import { BLOG_POSTS, getBlogCategories, getBlogAuthors } from '@/lib/blog-data'
import BlogNavbar from '@/components/blog/BlogNavbar'
import BlogFooter from '@/components/blog/BlogFooter'
import FeaturedArticle from '@/components/blog/FeaturedArticle'
import ArticleCard from '@/components/blog/ArticleCard'
import AuthorCard from '@/components/blog/AuthorCard'
import SearchBar from '@/components/blog/SearchBar'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Blog — ToroPay',
  description: 'Guides, comparisons, and tips for Indian businesses on UPI payments, payment links, and digital payment strategies.',
  alternates: { canonical: 'https://toropay.co.in/blog' },
}

export default function BlogPage() {
  const categories = getBlogCategories()
  const authors = getBlogAuthors()
  const featured = BLOG_POSTS.find(p => p.featured)
  const remaining = BLOG_POSTS.filter(p => p.slug !== featured?.slug)

  return (
    <div className="min-h-screen bg-white">
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="pt-16 pb-10 sm:pt-20 sm:pb-12">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">Blog</h1>
            <p className="mt-4 text-lg text-gray-500">Insights on UPI payments, fintech, and building for Indian businesses.</p>
          </div>
          <div className="mt-8 max-w-md">
            <SearchBar />
          </div>
        </section>

        {/* Featured */}
        {featured && (
          <section className="pb-12">
            <FeaturedArticle post={featured} />
          </section>
        )}

        {/* Category Filter + Articles */}
        <section className="border-t border-gray-100 py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold tracking-tight text-gray-900">All Articles</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <Link
                  key={cat}
                  href={`/blog/category/${cat.toLowerCase()}`}
                  className="rounded-full bg-gray-100 px-4 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-200 hover:text-gray-900"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {remaining.map(post => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
        </section>

        {/* Authors */}
        <section className="border-t border-gray-100 py-12">
          <h2 className="text-lg font-bold tracking-tight text-gray-900">Authors</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {authors.map(author => (
              <AuthorCard
                key={author.slug}
                author={author}
                postCount={BLOG_POSTS.filter(p => p.author.slug === author.slug).length}
              />
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-gray-100 py-16">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Free UPI payments for your business</h2>
            <p className="mt-3 text-gray-500">Zero transaction fees. Branded payment pages. Instant setup. Used by thousands of Indian businesses.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800">
                Create free account
              </Link>
              <Link href="/login" className="rounded-lg border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
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
