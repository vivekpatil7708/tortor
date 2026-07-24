import type { BlogPost } from '@/lib/blog-data'
import ArticleCard from './ArticleCard'

export default function RelatedPosts({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) return null

  return (
    <section className="mt-16 border-t border-gray-100 pt-12">
      <h3 className="text-lg font-bold tracking-tight text-gray-900">Continue reading</h3>
      <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map(post => (
          <ArticleCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  )
}
