import Link from 'next/link'
import type { BlogAuthor } from '@/lib/blog-data'

export default function AuthorCard({ author, postCount }: { author: BlogAuthor; postCount: number }) {
  return (
    <Link href={`/blog/author/${author.slug}`} className="group block rounded-xl border border-gray-100 bg-white p-5 transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-gray-100">
          <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{author.name}</p>
          <p className="text-xs text-gray-400">{author.role}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-500 line-clamp-2">{author.bio}</p>
      <p className="mt-2 text-xs text-gray-400">{postCount} article{postCount !== 1 ? 's' : ''}</p>
    </Link>
  )
}
