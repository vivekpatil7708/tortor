'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

const LINKS = [
  ['#features', 'Features'],
  ['#how', 'How it works'],
  ['#who', "Who it's for"],
  ['#faq', 'FAQ'],
] as const

export function LandingMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="landing-menu"
        className="flex items-center justify-center rounded-lg border border-white/15 bg-white/10 p-2.5 text-white hover:bg-white/15"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
      </button>

      {open && (
        <div id="landing-menu" className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-white/10 bg-ink/90 p-2 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl">
          {LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white"
            >
              {label}
            </a>
          ))}
          <Link
            href="/blog"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white"
          >
            Blog
          </Link>
          <Link
            href="/pay/demo-booking"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white"
          >
            Try the live demo
          </Link>
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg border-t border-white/10 px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white"
          >
            Log in
          </Link>
        </div>
      )}
    </div>
  )
}
