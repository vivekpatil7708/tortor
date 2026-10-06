import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ReactNode } from 'react'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getImpersonation: vi.fn(),
  clearImpersonation: vi.fn(),
  destroySession: vi.fn(),
}))
vi.mock('@/lib/auth', () => auth)
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`) }),
}))
// The dashboard's surrounding parts aren't under test here.
vi.mock('@/components/dashboard/admin-view-banner', () => ({ AdminViewBanner: () => null }))
vi.mock('@/components/dashboard/sidebar', () => ({ Sidebar: () => null }))
vi.mock('@/components/dashboard/donation-prompt', () => ({ DonationPrompt: () => null }))
vi.mock('@/components/dashboard/onboarding-tour', () => ({ OnboardingTour: () => null }))
vi.mock('@/components/dashboard/verify-email-banner', () => ({ VerifyEmailBanner: () => null }))
vi.mock('@/components/toast', () => ({ ToastProvider: ({ children }: { children: ReactNode }) => children }))

import { GET as sessionEnded } from '@/app/api/auth/session-ended/route'
import DashboardLayout from '@/app/(dashboard)/layout'

const visit = () => sessionEnded(new NextRequest('https://www.toropay.co.in/api/auth/session-ended'))

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockResolvedValue(null)
  auth.getImpersonation.mockResolvedValue(null)
})

describe('a login that has ended elsewhere (B1)', () => {
  it('clears the cookies and opens the login page with a message', async () => {
    const res = await visit()

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://www.toropay.co.in/login?ended=1')
    expect(auth.destroySession).toHaveBeenCalledTimes(1)
  })

  it('leaves a working login alone, so a link to this address signs nobody out', async () => {
    auth.getSession.mockResolvedValue({ id: 'm1' })

    const res = await visit()

    expect(res.headers.get('location')).toBe('https://www.toropay.co.in/dashboard')
    expect(auth.destroySession).not.toHaveBeenCalled()
    expect(auth.clearImpersonation).not.toHaveBeenCalled()
  })

  it("ends only the admin's merchant view when that merchant is suspended or gone", async () => {
    auth.getImpersonation.mockResolvedValue({ merchantId: 'm2', adminEmail: 'admin@example.com' })

    const res = await visit()

    expect(res.headers.get('location')).toBe('https://www.toropay.co.in/admin')
    expect(auth.clearImpersonation).toHaveBeenCalledTimes(1)
    expect(auth.destroySession).not.toHaveBeenCalled()
  })
})

describe('dashboard layout (B1)', () => {
  it('sends a browser whose login has ended to be signed out, instead of an empty dashboard', async () => {
    await expect(DashboardLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /api/auth/session-ended')
  })

  it('shows the dashboard for a working login', async () => {
    auth.getSession.mockResolvedValue({ id: 'm1', email: 'shop@example.com', emailVerifiedAt: new Date() })
    await expect(DashboardLayout({ children: null })).resolves.toBeTruthy()
  })
})
