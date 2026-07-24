import Link from 'next/link'
import type { BlogPost } from '@/lib/blog-data'

export default function FeaturedArticle({ post }: { post: BlogPost }) {
  const date = new Date(post.publishedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <article className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all hover:shadow-lg">
      <div className="p-8 sm:p-10">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="rounded-full bg-primary-50 px-3 py-0.5 font-semibold text-primary-600">Featured</span>
          <span>·</span>
          <Link href={`/blog/category/${post.category.toLowerCase()}`} className="font-medium text-primary-600 transition-colors hover:text-primary-700">
            {post.category}
          </Link>
          <span>·</span>
          <time dateTime={post.publishedAt}>{date}</time>
          <span>·</span>
          <span>{post.readTime}</span>
        </div>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
          <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-primary-600">
            {post.title}
          </Link>
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-500">{post.excerpt}</p>
        <div className="mt-6 flex items-center gap-3">
          <div className="h-9 w-9 overflow-hidden rounded-full bg-gray-100">
            <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className="text-sm">
            <Link href={`/blog/author/${post.author.slug}`} className="font-medium text-gray-900 transition-colors hover:text-primary-600">
              {post.author.name}
            </Link>
            <p className="text-xs text-gray-400">{post.author.role}</p>
          </div>
        </div>
      </div>
    </article>
  )
}
