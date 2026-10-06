import { describe, expect, it, vi } from 'vitest'
import { finishOnboarding } from './onboarding'

function fakeApi() {
  return {
    addUpi: vi.fn<(vpa: string) => Promise<unknown>>(async () => ({ upi: {} })),
    getUpis: vi.fn<() => Promise<Record<string, unknown>[]>>(async () => []),
    completeOnboarding: vi.fn<() => Promise<unknown>>(async () => ({ success: true })),
  }
}

describe('finishing setup (B12)', () => {
  it('saves the UPI ID, then marks setup as done', async () => {
    const api = fakeApi()

    await finishOnboarding(api, 'shop@okaxis')

    expect(api.addUpi).toHaveBeenCalledWith('shop@okaxis')
    expect(api.completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('finishes on a retry after the connection dropped between the two steps', async () => {
    // First try: the UPI ID was saved, then the connection dropped.
    const api = fakeApi()
    api.completeOnboarding.mockRejectedValueOnce(new Error('Unable to connect to server'))
    await expect(finishOnboarding(api, 'shop@okaxis')).rejects.toThrow('Unable to connect')

    // Second try: "already added" now counts as done.
    api.addUpi.mockRejectedValue(new Error('This UPI ID is already added'))
    api.getUpis.mockResolvedValue([{ vpa: 'shop@okaxis' }])
    await finishOnboarding(api, ' Shop@OKAXIS ')

    expect(api.completeOnboarding).toHaveBeenCalledTimes(2)
  })

  it('still shows a real problem with the UPI ID', async () => {
    const api = fakeApi()
    api.addUpi.mockRejectedValue(new Error('Invalid VPA format (e.g. merchant@paytm)'))

    await expect(finishOnboarding(api, 'not-a-upi')).rejects.toThrow('Invalid VPA format')
    expect(api.completeOnboarding).not.toHaveBeenCalled()
  })

  it("doesn't finish when the saved list can't be read either", async () => {
    const api = fakeApi()
    api.addUpi.mockRejectedValue(new Error('Unable to connect to server'))
    api.getUpis.mockRejectedValue(new Error('Unable to connect to server'))

    await expect(finishOnboarding(api, 'shop@okaxis')).rejects.toThrow('Unable to connect')
    expect(api.completeOnboarding).not.toHaveBeenCalled()
  })
})
