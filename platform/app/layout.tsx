import type { Metadata } from 'next'
import './globals.css'

const baseUrl = 'https://toropay.co.in'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'ToroPay — UPI Payment Links for Indian Businesses',
    template: '%s | ToroPay',
  },
  description: 'Create branded UPI payment links, QR codes, and hosted checkout pages with your own merchant UPI ID. 100% free — unlimited links, zero fees.',
  icons: {
    icon: '/favicon.svg',
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'ToroPay — Free UPI Payment Pages for India',
    description: 'Create branded UPI payment links, QR codes, and hosted checkout pages. 100% free, unlimited links, zero fees.',
    url: baseUrl,
    siteName: 'ToroPay',
    type: 'website',
  },
  alternates: {
    canonical: baseUrl,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-charcoal antialiased">{children}</body>
    </html>
  )
}
