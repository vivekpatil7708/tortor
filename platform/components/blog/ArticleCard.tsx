import Link from 'next/link'
import type { BlogPost } from '@/lib/blog-data'

export default function ArticleCard({ post, large = false }: { post: BlogPost; large?: boolean }) {
  const date = new Date(post.publishedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  if (large) {
    return (
      <Link href={`/blog/${post.slug}`} className="group block">
        <article>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-medium text-primary-600">
              {post.category}
            </span>
            <span>·</span>
            <time dateTime={post.publishedAt}>{date}</time>
            <span>·</span>
            <span>{post.readTime}</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 transition-colors group-hover:text-primary-600 sm:text-3xl">
            {post.title}
          </h2>
          <p className="mt-2.5 text-base leading-relaxed text-gray-500">{post.excerpt}</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-8 w-8 overflow-hidden rounded-full bg-gray-100">
              <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-900">
                {post.author.name}
              </span>
            </div>
          </div>
        </article>
      </Link>
    )
  }

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article className="flex flex-col">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-primary-600">
            {post.category}
          </span>
          <span>·</span>
          <time dateTime={post.publishedAt}>{date}</time>
        </div>
        <h3 className="mt-2 text-lg font-bold leading-snug tracking-tight text-gray-900 transition-colors group-hover:text-primary-600">
          {post.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500 line-clamp-2">{post.excerpt}</p>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-600">{post.author.name}</span>
          <span>·</span>
          <span>{post.readTime}</span>
        </div>
      </article>
    </Link>
  )
}
