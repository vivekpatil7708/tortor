import type { Metadata } from 'next'
import './globals.css'

const baseUrl = 'https://www.toropay.co.in'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'ToroPay — UPI Payment Links for Indian Businesses',
    template: '%s | ToroPay',
  },
  description: 'Pay by link in India with ToroPay — a free UPI payment link generator and payment gateway without a website. Create branded UPI payment links, QR codes, and hosted checkout pages with your own merchant UPI ID. 100% free — unlimited links, zero fees.',
  keywords: [
    'pay by link india',
    'payment gateway without website',
    'payment link generator',
    'payment link generate',
    'payment link generate online',
    'create payment link free',
    'create payment link for personal use',
    'how to create payment link to receive money',
    'how to create payment link for bank account',
    'upi payment link generate',
    'upi payment link generate online',
    'free upi payment link generate',
    'gpay payment link generate',
    'gpay payment link generate online',
    'gpay link generator',
    'gpay payment link create',
    'gpay payment links',
    'google pay payment link generate',
    'google pay link to receive money',
    'how to create a google pay payment link',
    'upi payment request in google pay',
    'google pay url link',
    'paytm payment link generate',
    'phonepe payment link generate',
    'UPI payment links India',
    'free payment gateway India',
    'collect payments without website',
    'payment links for businesses',
    'UPI payment links',
    'ToroPay payment links',
  ],
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
