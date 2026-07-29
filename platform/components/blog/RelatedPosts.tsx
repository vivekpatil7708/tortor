import type { BlogPost } from '@/lib/blog-data'
import ArticleCard from './ArticleCard'

export default function RelatedPosts({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) return null

  return (
    <section className="not-prose mt-20 border-t border-gray-200 pt-12">
      <h3 className="font-serif text-2xl font-bold tracking-tight text-gray-900">
        Continue reading
      </h3>
      <div className="mt-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map(post => (
          <ArticleCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  )
}
