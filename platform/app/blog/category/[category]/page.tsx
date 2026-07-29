import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BLOG_POSTS, getPostsByCategory, getCategoryDescription, getBlogCategories } from '@/lib/blog-data'
import BlogNavbar from '@/components/blog/BlogNavbar'
import BlogFooter from '@/components/blog/BlogFooter'
import ArticleCard from '@/components/blog/ArticleCard'
import SearchBar from '@/components/blog/SearchBar'

type Props = { params: { category: string } }

export function generateStaticParams() {
  return getBlogCategories().map(c => ({ category: c.toLowerCase() }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getBlogCategories().find(c => c.toLowerCase() === params.category.toLowerCase())
  if (!category) return { title: 'Not Found' }
  return {
    title: `${category} — ToroPay Blog`,
    description: getCategoryDescription(category),
    alternates: { canonical: `https://toropay.co.in/blog/category/${params.category}` },
  }
}

export default function CategoryPage({ params }: Props) {
  const category = getBlogCategories().find(c => c.toLowerCase() === params.category.toLowerCase())
  if (!category) notFound()

  const posts = getPostsByCategory(category)
  const allCategories = getBlogCategories()

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-16 pb-8 sm:pt-20 sm:pb-10">
          <div className="flex items-center gap-2.5 text-xs">
            <Link href="/blog" className="font-medium text-primary-600 transition-colors hover:text-primary-700">Blog</Link>
            <span className="text-gray-300">/</span>
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 font-medium text-primary-600">{category}</span>
          </div>
          <h1 className="mt-4 font-serif text-4xl font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-5xl">
            {category}
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-gray-500">
            {getCategoryDescription(category)}
          </p>
          <div className="mt-6 max-w-md">
            <SearchBar />
          </div>
        </section>

        {/* Category tabs */}
        <section className="border-t border-gray-200 py-8">
          <div className="flex flex-wrap gap-2">
            {allCategories.map(cat => (
              <Link
                key={cat}
                href={`/blog/category/${cat.toLowerCase()}`}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                  cat.toLowerCase() === params.category.toLowerCase()
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {cat}
              </Link>
            ))}
          </div>
        </section>

        {/* Articles */}
        <section className="pb-16">
          {posts.length === 0 ? (
            <p className="py-16 text-center text-gray-400">No articles in this category yet.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map(post => (
                <ArticleCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="border-t border-gray-200 py-16">
          <div className="mx-auto max-w-xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-600">
              ToroPay
            </span>
            <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-gray-900">Free UPI payments for your business</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-500">Zero transaction fees. Branded payment pages. Instant settlement.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800">
                Create free account
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <BlogFooter />
    </div>
  )
}
