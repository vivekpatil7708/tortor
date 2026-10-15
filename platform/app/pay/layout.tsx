import type { Metadata } from 'next'

// Payment pages are transactional and user-specific — keep them out of search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children
}
