import { describe, expect, it, vi } from 'vitest'
import { buildCsv, csvCell } from './export-csv'

// The customer export reassembles rows before handing them to buildCsv. These
// cover the parts of that shape a spreadsheet depends on.
describe('customer export rows', () => {
  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'tags', label: 'Tags' },
    { key: 'total_orders', label: 'Orders' },
    { key: 'total_spent', label: 'Ordered' },
    { key: 'total_paid', label: 'Paid' },
    { key: 'marketing_consent', label: 'Marketing Consent' },
  ]

  /** Mirrors how the page shapes a customer before export. */
  const toRow = (c: Record<string, unknown>) => ({
    ...c,
    tags: Array.isArray(c.tags) ? (c.tags as string[]).join(', ') : '',
    marketing_consent: c.marketing_consent ? 'Yes' : 'No',
  })

  it('writes friendly column headers, not raw field names', () => {
    const csv = buildCsv(columns, [toRow({ full_name: 'Asha', total_paid: 1500, tags: [], marketing_consent: true })])
    expect(csv.split('\r\n')[0]).toBe('Name,Phone,Tags,Orders,Ordered,Paid,Marketing Consent')
  })

  it('turns a tag list into readable text', () => {
    const csv = buildCsv(columns, [toRow({ full_name: 'Asha', tags: ['vip', 'repeat'], marketing_consent: false })])
    // The comma inside the joined tags must be quoted so it stays one cell.
    expect(csv).toContain('"vip, repeat"')
  })

  it('reports consent as Yes or No rather than true or false', () => {
    const yes = buildCsv(columns, [toRow({ full_name: 'A', tags: [], marketing_consent: true })])
    const no = buildCsv(columns, [toRow({ full_name: 'B', tags: [], marketing_consent: false })])
    expect(yes).toContain('Yes')
    expect(no).toContain('No')
  })

  it('keeps ordered and paid as separate columns', () => {
    const csv = buildCsv(columns, [toRow({ full_name: 'Asha', tags: [], total_spent: 29430, total_paid: 15231 })])
    expect(csv).toContain('29430,15231')
  })

  it('still neutralises a name that looks like a formula', () => {
    const csv = buildCsv(columns, [toRow({ full_name: '=SUM(A1:A9)', tags: [], marketing_consent: false })])
    expect(csv).toContain("'=SUM(A1:A9)")
  })

  it('leaves a long phone number intact rather than turning it into a number', () => {
    expect(csvCell('9876543210')).toBe('9876543210')
    expect(csvCell('+919876543210')).toBe('+919876543210')
  })
})

describe('paging the export', () => {
  /**
   * The export walks every page so a large account is not silently truncated.
   * This mirrors fetchAllCustomers' loop against a fake endpoint.
   */
  async function walk<T>(fetchPage: (cursor: string | null) => Promise<{ rows: T[]; next_cursor: string | null }>) {
    const all: T[] = []
    let cursor: string | null = null
    let guard = 0
    do {
      if (guard++ > 50) throw new Error('paging did not terminate')
      const page = await fetchPage(cursor)
      all.push(...page.rows)
      if (page.next_cursor === cursor) break
      cursor = page.next_cursor
    } while (cursor)
    return all
  }

  it('collects rows across several pages', async () => {
    const pages = [[1, 2], [3, 4], [5]]
    const fetchPage = vi.fn(async (cursor: string | null) => {
      const index = cursor ? Number(cursor) : 0
      return { rows: pages[index] ?? [], next_cursor: index + 1 < pages.length ? String(index + 1) : null }
    })

    expect(await walk(fetchPage)).toEqual([1, 2, 3, 4, 5])
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('stops when the server repeats the cursor, rather than looping forever', async () => {
    const fetchPage = vi.fn(async () => ({ rows: ['same'], next_cursor: 'stuck' }))
    // A repeated cursor ends the walk. It fetches once more to notice the repeat,
    // which is the point: the loop always terminates instead of running forever.
    await expect(walk(fetchPage)).resolves.toEqual(['same', 'same'])
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('handles an empty account', async () => {
    expect(await walk(async () => ({ rows: [], next_cursor: null }))).toEqual([])
  })
})
