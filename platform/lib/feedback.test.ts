import { describe, expect, it } from 'vitest'
import { safeUsefulParts } from './feedback'

describe('safeUsefulParts', () => {
  it('reads the parts a response names', () => {
    expect(safeUsefulParts('["Tracking payments","Payment reminders"]')).toEqual([
      'Tracking payments',
      'Payment reminders',
    ])
  })

  it('has no parts when there are none', () => {
    expect(safeUsefulParts('[]')).toEqual([])
    expect(safeUsefulParts(null)).toEqual([])
    expect(safeUsefulParts(undefined)).toEqual([])
  })

  it('does not fall over on a row that holds something else', () => {
    expect(safeUsefulParts('not json')).toEqual([])
    expect(safeUsefulParts('{"a":1}')).toEqual([])
  })

  it('keeps only the parts that are text', () => {
    expect(safeUsefulParts('["Tracking payments", 42, null]')).toEqual(['Tracking payments'])
  })
})
