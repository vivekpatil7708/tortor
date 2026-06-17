// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportToCSV(filename: string, columns: { key: string; label: string }[], data: any[]) {
  const header = columns.map(c => `"${c.label}"`).join(',')

  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key]
      if (val == null) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')
  )

  const csv = '\uFEFF' + [header, ...rows].join('\r\n')
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
