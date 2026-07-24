import type { Metadata } from 'next'
import Link from 'next/link'
import { BLOG_POSTS } from '@/lib/blog-data'

export const metadata: Metadata = {
  title: 'Blog — ToroPay',
  description: 'Guides, comparisons, and tips for Indian businesses on UPI payments, payment links, cashless solutions, and digital payment strategies.',
  alternates: { canonical: 'https://toropay.co.in/blog' },
}

export default function BlogPage() {
  const posts = BLOG_POSTS

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-charcoal">Log in</Link>
          <Link href="/signup" className="rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Get started</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-32">
        <div className="pt-16 pb-12 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Blog</h1>
          <p className="mt-4 text-lg text-gray-500">Guides, comparisons, and tips for Indian businesses on UPI payments.</p>
        </div>

        <div className="space-y-6">
          {posts.map(post => (
            <Link key={post.slug} href={`/blog/${post.slug}`}
              className="block rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm transition-all hover:bg-white/80 hover:shadow-md">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span className="rounded-md bg-primary-50 px-2 py-0.5 font-medium text-primary-600">{post.category}</span>
                <span>{post.readTime}</span>
                <span>·</span>
                <time dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
              </div>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-charcoal">{post.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{post.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {post.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{tag}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-16 rounded-3xl bg-charcoal p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight">Ready to accept free UPI payments?</h2>
          <p className="mt-3 text-gray-300">Create your free ToroPay account in 2 minutes. Zero fees, branded pages, instant setup.</p>
          <Link href="/signup" className="mt-6 inline-block rounded-xl bg-primary-500 px-8 py-3.5 text-base font-semibold text-white hover:bg-primary-600">
            Create free account
          </Link>
        </div>
      </main>
    </div>
  )
}
