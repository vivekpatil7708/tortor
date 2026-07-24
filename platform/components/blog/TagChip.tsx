import Link from 'next/link'

export default function TagChip({ tag, active = false }: { tag: string; active?: boolean }) {
  return (
    <Link
      href={`/blog/tag/${encodeURIComponent(tag.toLowerCase().replace(/\s+/g, '-'))}`}
      className={`inline-block rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
      }`}
    >
      {tag}
    </Link>
  )
}
