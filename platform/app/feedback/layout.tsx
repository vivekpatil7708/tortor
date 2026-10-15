import type { Metadata } from 'next'

// The feedback form is a utility page, not landing content.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return children
}
