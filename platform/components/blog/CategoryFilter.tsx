'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function CategoryFilter({ categories, active }: { categories: string[]; active?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setCategory(cat: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (cat) {
      params.set('category', cat.toLowerCase())
    } else {
      params.delete('category')
    }
    router.push(`/blog?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setCategory(null)}
        className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
          !active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
        }`}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => setCategory(cat)}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
            active?.toLowerCase() === cat.toLowerCase()
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
