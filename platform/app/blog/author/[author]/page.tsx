import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAuthor, getPostsByAuthor, getBlogAuthors } from '@/lib/blog-data'
import BlogNavbar from '@/components/blog/BlogNavbar'
import BlogFooter from '@/components/blog/BlogFooter'
import ArticleCard from '@/components/blog/ArticleCard'

type Props = { params: { author: string } }

export function generateStaticParams() {
  return getBlogAuthors().map(a => ({ author: a.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const author = getAuthor(params.author)
  if (!author) return { title: 'Not Found' }
  return {
    title: `${author.name} — ToroPay Blog`,
    description: author.bio,
    alternates: { canonical: `https://toropay.co.in/blog/author/${params.author}` },
  }
}

export default function AuthorPage({ params }: Props) {
  const author = getAuthor(params.author)
  if (!author) notFound()

  const posts = getPostsByAuthor(params.author)

  return (
    <div className="min-h-screen bg-white">
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-16 pb-10 sm:pt-20 sm:pb-12">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link href="/blog" className="font-medium text-primary-600 transition-colors hover:text-primary-700">Blog</Link>
            <span>·</span>
            <span>Authors</span>
          </div>

          <div className="mt-6 flex items-start gap-5">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
              <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{author.name}</h1>
              <p className="mt-1 text-sm font-medium text-primary-600">{author.role}</p>
              <p className="mt-3 max-w-lg text-base text-gray-500 leading-relaxed">{author.bio}</p>
            </div>
          </div>
        </section>

        <section className="border-t border-gray-100 py-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Articles by {author.name}
            <span className="ml-2 text-gray-300">({posts.length})</span>
          </h2>
          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map(post => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
          {posts.length === 0 && (
            <p className="py-12 text-center text-gray-400">No articles yet.</p>
          )}
        </section>

        <section className="border-t border-gray-100 py-16">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Free UPI payments for your business</h2>
            <p className="mt-3 text-gray-500">Zero transaction fees. Branded payment pages. Instant setup.</p>
            <div className="mt-6">
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
