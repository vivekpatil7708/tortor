import type { MetadataRoute } from 'next'
import { BLOG_POSTS, getBlogCategories, getBlogAuthors, getPostsByAuthor } from '@/lib/blog-data'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://toropay.co.in'

  const blogEntries = BLOG_POSTS.map(post => ({
    url: `${base}/blog/${post.slug}/`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  const categoryEntries = getBlogCategories().map(cat => ({
    url: `${base}/blog/category/${cat.toLowerCase()}/`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const authorEntries = getBlogAuthors().map(author => ({
    url: `${base}/blog/author/${author.slug}/`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [
    { url: base + '/', lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/blog/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    ...blogEntries,
    ...categoryEntries,
    ...authorEntries,
    { url: `${base}/donate/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/terms/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/privacy/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ]
}
