import { describe, expect, it } from 'vitest'
import { loyaltyPointsForAmount } from './loyalty-rules'

describe('loyalty earning', () => {
  it('awards 1 point per ₹10', () => {
    expect(loyaltyPointsForAmount(499, 0.1)).toBe(49)
    expect(loyaltyPointsForAmount(10, 0.1)).toBe(1)
    expect(loyaltyPointsForAmount(9.99, 0.1)).toBe(0)
  })

  it('handles whole-number rates and rounds down', () => {
    expect(loyaltyPointsForAmount(499, 1)).toBe(499)
    expect(loyaltyPointsForAmount(2.5, 2)).toBe(5)
  })

  it('does not award points when earning is off or the amount is invalid', () => {
    expect(loyaltyPointsForAmount(499, 0)).toBe(0)
    expect(loyaltyPointsForAmount(0, 0.1)).toBe(0)
    expect(loyaltyPointsForAmount(-10, 0.1)).toBe(0)
    expect(loyaltyPointsForAmount(499, Number.NaN)).toBe(0)
  })
})
