import type { Metadata } from 'next'
import './globals.css'

const baseUrl = 'https://www.toropay.co.in'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'ToroPay — UPI Payment Links for Indian Businesses',
    template: '%s | ToroPay',
  },
  applicationName: 'ToroPay',
  description: 'Create and share free UPI payment links in India with ToroPay — a payment link generator that needs no website and no payment gateway. Get paid directly to your own UPI ID with branded checkout pages and QR codes. Free, with unlimited links and no transaction fees.',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.svg',
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'ToroPay — Free UPI Payment Links for Indian Businesses',
    description: 'Create branded UPI payment links, QR codes, and hosted checkout pages that pay directly to your own UPI ID. Free, no coding, no transaction fees.',
    url: baseUrl + '/',
    siteName: 'ToroPay',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ToroPay — Free UPI Payment Links for Indian Businesses',
    description: 'Create branded UPI payment links, QR codes, and hosted checkout pages that pay directly to your own UPI ID. Free, no coding, no transaction fees.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="bg-cream text-charcoal antialiased">{children}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){var p=location.pathname;if(!p.startsWith('/admin')&&!p.startsWith('/dashboard')&&!p.startsWith('/api')&&!p.startsWith('/accept-invite')){navigator.sendBeacon('/api/analytics/pageview',JSON.stringify({path:p}))}})()`
        }} />
      </body>
    </html>
  )
}
