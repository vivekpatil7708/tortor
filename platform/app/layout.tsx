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
    apple: '/apple-touch-icon.svg',
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'ToroPay — Free UPI Payment Pages for India',
    description: 'Create branded UPI payment links, QR codes, and hosted checkout pages. 100% free, unlimited links, zero fees.',
    url: baseUrl + '/',
    siteName: 'ToroPay',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ToroPay — Free UPI Payment Pages for India',
    description: 'Create branded UPI payment links, QR codes, and hosted checkout pages. 100% free, unlimited links, zero fees.',
  },
  alternates: {
    canonical: baseUrl + '/',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-charcoal antialiased">{children}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){var p=location.pathname;if(!p.startsWith('/admin')&&!p.startsWith('/dashboard')&&!p.startsWith('/api')){navigator.sendBeacon('/api/analytics/pageview',JSON.stringify({path:p}))}})()`
        }} />
      </body>
    </html>
  )
}
