import type { MetadataRoute } from 'next'
import { BLOG_POSTS, getBlogCategories, getBlogAuthors } from '@/lib/blog-data'
import { DOCS } from '@/lib/docs-content'

// Canonical production origin (no trailing slash). Keep in sync with app/layout.tsx.
const BASE = 'https://www.toropay.co.in'

export default function sitemap(): MetadataRoute.Sitemap {
  // Real publish/update dates come from the post data — never generated at request time.
  const blogEntries = BLOG_POSTS.map(post => ({
    url: `${BASE}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  const categoryEntries = getBlogCategories().map(cat => ({
    url: `${BASE}/blog/category/${cat.toLowerCase()}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const authorEntries = getBlogAuthors().map(author => ({
    url: `${BASE}/blog/author/${author.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  const docEntries = DOCS.map(doc => ({
    url: `${BASE}/docs/${doc.slug}`,
    lastModified: new Date(`${doc.updated}T00:00:00Z`),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/features`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/how-payments-work`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/docs`, changeFrequency: 'monthly', priority: 0.8 },
    ...docEntries,
    { url: `${BASE}/blog`, changeFrequency: 'weekly', priority: 0.9 },
    ...blogEntries,
    ...categoryEntries,
    ...authorEntries,
    { url: `${BASE}/donate`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
