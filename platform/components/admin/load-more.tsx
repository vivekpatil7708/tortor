'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The button that loads the next page of a list that is read a page at a
 * time. The cursor comes from the API, so the same list can be walked from
 * the start without loading everything.
 */
export function LoadMore({
  cursor,
  onLoad,
  loading = false,
  label = 'Load more',
  className = '',
}: {
  cursor: string | null
  onLoad: () => void
  loading?: boolean
  label?: string
  className?: string
}) {
  if (!cursor) return null
  return (
    <div className={`flex justify-center ${className}`}>
      <button
        type="button"
        onClick={onLoad}
        disabled={loading}
        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? 'Loading...' : label}
      </button>
    </div>
  )
}

/**
 * Runs a function a moment after the value stops changing. Used for the
 * live preview, so a database query is not made for every keystroke.
 */
export function useDebounced<T>(value: T, delay = 700): T {
  const [debounced, setDebounced] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(value), delay)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, delay])

  return debounced
}
