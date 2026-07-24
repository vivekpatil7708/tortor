'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { searchPosts } from '@/lib/blog-data'
import ArticleCard from '@/components/blog/ArticleCard'
import SearchBar from '@/components/blog/SearchBar'

export default function SearchPageContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const results = query ? searchPosts(query) : []

  return (
    <div className="pt-16 pb-20 sm:pt-20">
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Search</h1>
      <p className="mt-3 text-gray-500">Find articles about UPI payments, fintech, and digital business tools.</p>

      <div className="mt-8">
        <SearchBar initialQuery={query} autoFocus={!query} />
      </div>

      {query && (
        <div className="mt-8">
          <p className="text-sm text-gray-400">
            {results.length === 0
              ? `No results for "${query}"`
              : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`
            }
          </p>

          {results.length > 0 ? (
            <div className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {results.map(post => (
                <ArticleCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <div className="mt-12 rounded-2xl border border-gray-100 bg-gray-50 p-10 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <p className="mt-4 text-sm text-gray-500">No articles match your search. Try different keywords.</p>
              <Link href="/blog" className="mt-4 inline-block text-sm font-medium text-primary-600 hover:underline">
                Browse all articles
              </Link>
            </div>
          )}
        </div>
      )}

      {!query && (
        <div className="mt-12 rounded-2xl border border-gray-100 bg-gray-50 p-10 text-center">
          <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="mt-4 text-sm text-gray-500">Type above to search articles.</p>
        </div>
      )}
    </div>
  )
}
