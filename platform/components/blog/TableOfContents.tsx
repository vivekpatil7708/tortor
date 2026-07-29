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

    setTimeout(() => {
      items.forEach(item => {
        const el = document.getElementById(item.id)
        if (el) observer.observe(el)
      })
    }, 0)

    return () => observer.disconnect()
  }, [content])

  if (headings.length < 2) return null

  return (
    <nav>
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
        On this page
      </p>
      <ul className="space-y-1">
        {headings.map(h => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`group flex items-start gap-2 py-1.5 text-sm transition-all ${
                h.level === 3 ? 'pl-5' : ''
              } ${
                activeId === h.id
                  ? 'font-medium text-primary-600'
                  : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              <span
                className={`mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                  activeId === h.id ? 'bg-primary-500' : 'bg-gray-300'
                }`}
              />
              <span>{h.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
