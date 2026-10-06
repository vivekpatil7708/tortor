'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type TransactionFilters } from './api'

type Row = Record<string, unknown>

/** Transactions for the given filters, newest first, loaded a page at a time. */
export function useTransactionPages(filters: TransactionFilters, pageSize = 50) {
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
      const page = await api.getTransactions({ ...(JSON.parse(key) as TransactionFilters), limit: pageSize, cursor })
      if (call !== latest.current) return
      setRows(prev => (cursor ? [...prev, ...page.transactions] : page.transactions))
      if (!cursor) setTotal(page.total)
      setNextCursor(page.next_cursor)
    } catch (err) {
      if (call !== latest.current) return
      setError(err instanceof Error ? err.message : 'Could not load transactions')
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
    replaceRow: (row: Row) => setRows(prev => prev.map(r => (r.id === row.id ? row : r))),
    removeRow: (id: unknown) => {
      setRows(prev => prev.filter(r => r.id !== id))
      setTotal(t => (t === null ? t : Math.max(0, t - 1)))
    },
  }
}
