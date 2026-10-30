import type { Metadata } from 'next'

// Login/signup are utility pages: crawlable so the noindex directive is seen,
// but kept out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-blue-hero px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-sunlit-clay/15 blur-[110px]" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.05]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sunlit-clay/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-72 -right-48 h-[34rem] w-[34rem] rounded-full border-[3rem] border-sunlit-clay/[0.06]"
        aria-hidden
      />
      <main className="relative w-full max-w-sm">{children}</main>
    </div>
  )
}
