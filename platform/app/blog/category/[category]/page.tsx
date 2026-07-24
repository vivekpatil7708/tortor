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
    <div className="min-h-screen bg-white">
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-16 pb-10 sm:pt-20 sm:pb-12">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link href="/blog" className="font-medium text-primary-600 transition-colors hover:text-primary-700">Blog</Link>
            <span>·</span>
            <span>{category}</span>
          </div>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">{category}</h1>
          <p className="mt-4 max-w-xl text-lg text-gray-500">{getCategoryDescription(category)}</p>
          <div className="mt-8 max-w-md">
            <SearchBar />
          </div>
        </section>

        {/* Category tabs */}
        <section className="border-t border-gray-100 py-8">
          <div className="flex flex-wrap gap-2">
            {allCategories.map(cat => (
              <Link
                key={cat}
                href={`/blog/category/${cat.toLowerCase()}`}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                  cat.toLowerCase() === params.category.toLowerCase()
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
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
            <p className="py-12 text-center text-gray-400">No articles in this category yet.</p>
          ) : (
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map(post => (
                <ArticleCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="border-t border-gray-100 py-16">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Free UPI payments for your business</h2>
            <p className="mt-3 text-gray-500">Zero transaction fees. Branded payment pages. Instant setup.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800">
                Create free account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <BlogFooter />
    </div>
  )
}
