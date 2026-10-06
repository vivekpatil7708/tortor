import { AdminViewBanner } from '@/components/dashboard/admin-view-banner'
import { Sidebar } from '@/components/dashboard/sidebar'
import { OnboardingTour } from '@/components/dashboard/onboarding-tour'
import { VerifyEmailBanner } from '@/components/dashboard/verify-email-banner'
import { ToastProvider } from '@/components/toast'
import { getImpersonation, getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  // The cookie can still look valid after the login has ended (signed out on
  // another device, password reset, suspended): send it back to the login page.
  if (!session) redirect('/api/auth/session-ended')
  const impersonation = await getImpersonation()

  return (
    <ToastProvider>
      <div className="flex min-h-screen overflow-x-hidden bg-cream">
        {impersonation && (
          <div className="fixed inset-x-0 top-0 z-50">
            <AdminViewBanner merchantEmail={session.email} adminEmail={impersonation.adminEmail} />
          </div>
        )}
        <Sidebar />
        <main className="flex-1 overflow-auto pt-16 lg:pt-0">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-8">
            {!session.emailVerifiedAt && !impersonation && <VerifyEmailBanner email={session.email} />}
            {children}
          </div>
        </main>
        <OnboardingTour />
      </div>
    </ToastProvider>
  )
}