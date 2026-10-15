import type { Metadata } from 'next'

// Hosted checkout sessions are transactional — keep them out of search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
