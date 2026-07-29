import Link from 'next/link'
import type { BlogAuthor } from '@/lib/blog-data'

export default function AuthorCard({ author, postCount }: { author: BlogAuthor; postCount: number }) {
  return (
    <Link href={`/blog/author/${author.slug}`} className="group block rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center gap-3.5">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-gray-100 ring-2 ring-white shadow-sm">
          <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-primary-600">{author.name}</p>
          <p className="text-xs text-gray-400">{author.role}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-500 line-clamp-2">{author.bio}</p>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
        <span>{postCount} article{postCount !== 1 ? 's' : ''}</span>
      </div>
    </Link>
  )
}
