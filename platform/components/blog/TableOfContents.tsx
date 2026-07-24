'use client'

import { useEffect, useState } from 'react'

interface TOCItem {
  id: string
  text: string
  level: number
}

export default function TableOfContents({ content }: { content: string }) {
  const [headings, setHeadings] = useState<TOCItem[]>([])
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const temp = document.createElement('div')
    temp.innerHTML = content
    const hElements = temp.querySelectorAll('h2, h3')
    const items: TOCItem[] = Array.from(hElements).map((el, i) => {
      const id = el.textContent?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `heading-${i}`
      return { id, text: el.textContent || '', level: parseInt(el.tagName[1]) }
    })
    setHeadings(items)

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -80% 0px', threshold: 0 }
    )

    items.forEach(item => {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [content])

  if (headings.length < 2) return null

  return (
    <nav className="hidden xl:block">
      <div className="sticky top-24">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">On this page</p>
        <ul className="space-y-1.5 border-l border-gray-100">
          {headings.map(h => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={`block border-l-2 py-0.5 text-sm transition-all hover:text-gray-900 ${
                  h.level === 3 ? 'pl-6' : 'pl-4'
                } ${
                  activeId === h.id
                    ? 'border-gray-900 font-medium text-gray-900'
                    : 'border-transparent text-gray-400'
                }`}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
