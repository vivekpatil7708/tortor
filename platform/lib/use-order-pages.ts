'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type OrderQuery } from './api'

type Row = Record<string, unknown>

/**
 * Orders for the given filters, newest first, loaded a page at a time.
 *
 * The counterpart to useTransactionPages. They are kept separate because the
 * two endpoints take different filters; a shared abstraction would have to be
 * parameterised back into two shapes anyway.
 */
export function useOrderPages(filters: OrderQuery, pageSize = 50) {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Only the newest request may update the list (filters can change while one is on its way).
  const latest = useRef(0)
  const key = JSON.stringify(filters)

  const load = useCallback(async (cursor?: string) => {
    const call = ++latest.current
    setLoading(true)
    setError('')
    if (!cursor) {
      // New filters: never leave the previous filter's rows on screen.
      setRows([])
      setTotal(null)
      setNextCursor(null)
    }
    try {
      const page = await api.orders({ ...(JSON.parse(key) as OrderQuery), limit: pageSize, cursor })
      if (call !== latest.current) return
      setRows(prev => (cursor ? [...prev, ...page.orders] : page.orders))
      if (!cursor) setTotal(page.total)
      setNextCursor(page.next_cursor)
    } catch (err) {
      if (call !== latest.current) return
      setError(err instanceof Error ? err.message : 'Could not load orders')
    } finally {
      if (call === latest.current) setLoading(false)
    }
  }, [key, pageSize])

  useEffect(() => { load() }, [load])

  return {
    rows,
    total,
    loading,
    error,
    hasMore: nextCursor !== null,
    loadMore: () => { if (nextCursor && !loading) load(nextCursor) },
    reload: () => { load() },
  }
}
