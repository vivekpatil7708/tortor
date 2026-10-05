import { describe, expect, it } from 'vitest'
import { buildCsv, csvCell } from './export-csv'

describe('csvCell', () => {
  it('neutralises text that a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://evil.example","Click")')).toBe(`"'=HYPERLINK(""http://evil.example"",""Click"")"`)
    expect(csvCell('+cmd|calc')).toBe(`'+cmd|calc`)
    expect(csvCell('-2+3+cmd|calc')).toBe(`'-2+3+cmd|calc`)
    expect(csvCell('@SUM(A1:A9)')).toBe(`'@SUM(A1:A9)`)
    expect(csvCell('\t=1+1')).toBe(`'\t=1+1`)
  })

  it('leaves plain numbers and phone numbers alone', () => {
    expect(csvCell(-500)).toBe('-500')
    expect(csvCell('-500')).toBe('-500')
    expect(csvCell('+919876543210')).toBe('+919876543210')
    expect(csvCell(1499.5)).toBe('1499.5')
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Patil, Vivek')).toBe('"Patil, Vivek"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"')
  })

  it('writes empty cells for missing values', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('buildCsv', () => {
  it('builds a header and rows from the chosen columns', () => {
    const csv = buildCsv(
      [{ key: 'name', label: 'Customer Name' }, { key: 'amount', label: 'Amount' }],
      [{ name: '=1+1', amount: 250 }, { name: 'Asha, Pune', amount: -10 }]
    )
    expect(csv).toBe(`Customer Name,Amount\r\n'=1+1,250\r\n"Asha, Pune",-10`)
  })
})
