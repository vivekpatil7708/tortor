import { Sidebar } from '@/components/dashboard/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen overflow-x-hidden bg-cream">
      <Sidebar />
      <main className="flex-1 overflow-auto pt-16 lg:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  )
}
