import type { Metadata } from 'next'
import { Suspense } from 'react'
import BlogNavbar from '@/components/blog/BlogNavbar'
import BlogFooter from '@/components/blog/BlogFooter'
import SearchPageContent from './SearchContent'

export const metadata: Metadata = {
  title: 'Search — ToroPay Blog',
  description: 'Search ToroPay blog articles about UPI payments, payment links, and digital payment solutions for Indian businesses.',
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-white">
      <BlogNavbar />
      <main className="mx-auto max-w-3xl px-6">
        <Suspense fallback={
          <div className="pt-16 pb-20 sm:pt-20">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Search</h1>
            <p className="mt-3 text-gray-500">Loading...</p>
          </div>
        }>
          <SearchPageContent />
        </Suspense>
      </main>
      <BlogFooter />
    </div>
  )
}
