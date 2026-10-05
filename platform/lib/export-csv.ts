// Text that Excel or Sheets would run as a formula when the file is opened.
const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/

/** One CSV cell. Formula-like text gets a leading ' so it shows as plain text; plain numbers are left alone. */
export function csvCell(value: unknown): string {
  if (value == null) return ''
  let str = String(value)
  if (typeof value === 'string' && FORMULA_START.test(str) && !PLAIN_NUMBER.test(str)) {
    str = `'${str}`
  }
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCsv(columns: { key: string; label: string }[], data: any[]): string {
  const header = columns.map(c => csvCell(c.label)).join(',')
  const rows = data.map(row => columns.map(c => csvCell(row[c.key])).join(','))
  return [header, ...rows].join('\r\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportToCSV(filename: string, columns: { key: string; label: string }[], data: any[]) {
  const csv = '﻿' + buildCsv(columns, data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
