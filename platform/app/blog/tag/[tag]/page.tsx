import type { Metadata } from 'next'
import Link from 'next/link'
import { BLOG_POSTS } from '@/lib/blog-data'
import BlogNavbar from '@/components/blog/BlogNavbar'
import BlogFooter from '@/components/blog/BlogFooter'
import ArticleCard from '@/components/blog/ArticleCard'

type Props = { params: { tag: string } }

export function generateStaticParams() {
  const tags = new Set<string>()
  BLOG_POSTS.forEach(p => p.tags.forEach(t => tags.add(t.toLowerCase().replace(/\s+/g, '-'))))
  return Array.from(tags).map(tag => ({ tag }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = decodeURIComponent(params.tag).replace(/-/g, ' ')
  return {
    title: `"${tag}" — ToroPay Blog`,
    description: `Articles tagged with "${tag}" on the ToroPay blog.`,
    alternates: { canonical: `https://toropay.co.in/blog/tag/${params.tag}` },
  }
}

export default function TagPage({ params }: Props) {
  const tagSlug = params.tag
  const tagLabel = decodeURIComponent(tagSlug).replace(/-/g, ' ')
  const posts = BLOG_POSTS.filter(p =>
    p.tags.some(t => t.toLowerCase().replace(/\s+/g, '-') === tagSlug.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-white">
      <BlogNavbar />

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-16 pb-10 sm:pt-20 sm:pb-12">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link href="/blog" className="font-medium text-primary-600 transition-colors hover:text-primary-700">Blog</Link>
            <span>·</span>
            <span>Tagged</span>
          </div>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            &ldquo;{tagLabel}&rdquo;
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            {posts.length} article{posts.length !== 1 ? 's' : ''} tagged with this topic.
          </p>
        </section>

        <section className="pb-16">
          {posts.length === 0 ? (
            <p className="py-12 text-center text-gray-400">No articles with this tag yet.</p>
          ) : (
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map(post => (
                <ArticleCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </section>
      </main>

      <BlogFooter />
    </div>
  )
}
