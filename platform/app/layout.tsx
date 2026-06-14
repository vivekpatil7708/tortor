import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ToroPay — UPI Payment Links for Indian Businesses',
  description: 'Create branded UPI payment links, QR codes, and hosted checkout pages with your own merchant UPI ID.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-charcoal antialiased">{children}</body>
    </html>
  )
}
