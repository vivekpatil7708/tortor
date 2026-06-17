import { Sidebar } from '@/components/dashboard/sidebar'
import { DonationPrompt } from '@/components/dashboard/donation-prompt'
import { ToastProvider } from '@/components/toast'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen overflow-x-hidden bg-cream">
        <Sidebar />
        <main className="flex-1 overflow-auto pt-16 lg:pt-0">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-8">{children}</div>
        </main>
        <DonationPrompt />
      </div>
    </ToastProvider>
  )
}
