// Kept free of server imports so the loyalty page can preview the same maths.
export const MAX_LOYALTY_RATE = 1000
export const MAX_MANUAL_POINTS = 1_000_000

const MAX_INT = 1_000_000_000

/** Points for a payment at the merchant's rate, rounded down. 0 switches earning off. */
export function loyaltyPointsForAmount(amount: number, pointsPerRupee: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (!Number.isFinite(pointsPerRupee) || pointsPerRupee <= 0) return 0
  // The epsilon stops 10 × 0.1 from flooring to 0 because of floating point.
  return Math.min(MAX_INT, Math.max(0, Math.floor(amount * pointsPerRupee + 1e-9)))
}
