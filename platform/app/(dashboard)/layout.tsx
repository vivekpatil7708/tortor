import { AdminViewBanner } from '@/components/dashboard/admin-view-banner'
import { Sidebar } from '@/components/dashboard/sidebar'
import { DonationPrompt } from '@/components/dashboard/donation-prompt'
import { OnboardingTour } from '@/components/dashboard/onboarding-tour'
import { ToastProvider } from '@/components/toast'
import { getImpersonation, getSession } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const impersonation = await getImpersonation()

  return (
    <ToastProvider>
      <div className="flex min-h-screen overflow-x-hidden bg-cream">
        {impersonation && session && (
          <div className="fixed inset-x-0 top-0 z-50">
            <AdminViewBanner merchantEmail={session.email} adminEmail={impersonation.adminEmail} />
          </div>
        )}
        <Sidebar />
        <main className="flex-1 overflow-auto pt-16 lg:pt-0">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-8">{children}</div>
        </main>
        <DonationPrompt />
        <OnboardingTour />
      </div>
    </ToastProvider>
  )
}