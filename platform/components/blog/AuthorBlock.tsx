import Link from 'next/link'
import type { BlogAuthor } from '@/lib/blog-data'

export default function AuthorBlock({ author, date, readTime }: { author: BlogAuthor; date: string; readTime: string }) {
  const formattedDate = new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between">
      <Link href={`/blog/author/${author.slug}`} className="group flex items-center gap-3.5">
        <div className="h-11 w-11 overflow-hidden rounded-full bg-gray-200 ring-2 ring-white">
          <svg className="h-full w-full text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-primary-600">
            {author.name}
          </p>
          <p className="text-xs text-gray-400">{author.role}</p>
        </div>
      </Link>
      <div className="hidden text-right text-xs text-gray-400 sm:block">
        <p>{formattedDate}</p>
        <p className="text-gray-300">{readTime}</p>
      </div>
    </div>
  )
}
