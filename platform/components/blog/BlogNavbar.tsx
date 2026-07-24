'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function BlogNavbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/blog" className="flex items-center gap-2.5">
          <span className="text-xl font-bold tracking-tight text-gray-900">
            Toro<span className="text-primary-500">Pay</span>
          </span>
          <span className="hidden text-sm font-medium text-gray-300 sm:inline">/</span>
          <span className="hidden text-sm font-medium text-gray-500 sm:inline">Blog</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/blog" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">All Articles</Link>
          <Link href="/blog/category/tutorials" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Tutorials</Link>
          <Link href="/blog/category/comparisons" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Comparisons</Link>
          <Link href="/blog/category/guides" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Guides</Link>
          <Link href="/blog/search" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </Link>
          <Link href="/" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800">
            Get Started
          </Link>
        </nav>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 md:hidden"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            }
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-gray-100 bg-white px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link href="/blog" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">All Articles</Link>
            <Link href="/blog/category/tutorials" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">Tutorials</Link>
            <Link href="/blog/category/comparisons" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">Comparisons</Link>
            <Link href="/blog/category/guides" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">Guides</Link>
            <Link href="/blog/search" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">Search</Link>
            <Link href="/" onClick={() => setMenuOpen(false)} className="mt-2 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm font-medium text-white">Get Started</Link>
          </nav>
        </div>
      )}
    </header>
  )
}
