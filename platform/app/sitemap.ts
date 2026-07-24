import type { MetadataRoute } from 'next'
import { BLOG_POSTS } from '@/lib/blog-data'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://toropay.co.in'

  const blogEntries = BLOG_POSTS.map(post => ({
    url: `${base}/blog/${post.slug}/`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  return [
    { url: base + '/', lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/blog/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    ...blogEntries,
    { url: `${base}/donate/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/terms/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/privacy/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ]
}
