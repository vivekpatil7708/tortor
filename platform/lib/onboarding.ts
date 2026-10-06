/** The dashboard API calls that finishing setup needs. */
export interface OnboardingApi {
  addUpi(vpa: string): Promise<unknown>
  getUpis(): Promise<Record<string, unknown>[]>
  completeOnboarding(): Promise<unknown>
}

/**
 * Saves the merchant's UPI ID and marks setup as done. Safe to run again after a
 * dropped connection: a UPI ID that was already saved counts as done, so a retry
 * can't get stuck on "This UPI ID is already added".
 */
export async function finishOnboarding(api: OnboardingApi, vpa: string): Promise<void> {
  try {
    await api.addUpi(vpa)
  } catch (err) {
    const wanted = vpa.trim().toLowerCase()
    const saved = await api.getUpis().catch(() => [] as Record<string, unknown>[])
    if (!saved.some(u => String(u.vpa ?? '').toLowerCase() === wanted)) throw err
  }
  await api.completeOnboarding()
}
