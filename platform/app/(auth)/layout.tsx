import type { Metadata } from 'next'

// Login/signup are utility pages: crawlable so the noindex directive is seen,
// but kept out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cream to-beige px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
