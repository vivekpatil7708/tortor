import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </Link>
      </header>
      <div className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">Terms of Service</h1>
        <div className="space-y-6 text-sm leading-relaxed text-gray-600">
          <p><strong>Last updated:</strong> June 2026</p>

          <h2 className="text-lg font-bold text-charcoal">1. Acceptance of Terms</h2>
          <p>By using ToroPay (&quot;the Service&quot;), you agree to these terms. If you do not agree, do not use the Service.</p>

          <h2 className="text-lg font-bold text-charcoal">2. Description of Service</h2>
          <p>ToroPay provides UPI payment link generation, QR code creation, and hosted checkout pages. The Service is provided &quot;as is&quot; and is free to use.</p>

          <h2 className="text-lg font-bold text-charcoal">3. User Responsibilities</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide accurate information during registration</li>
            <li>Keep your account credentials secure</li>
            <li>Use the Service in compliance with all applicable laws</li>
            <li>Not use the Service for fraudulent or illegal transactions</li>
            <li>Ensure your UPI ID is valid and belongs to you or your business</li>
          </ul>

          <h2 className="text-lg font-bold text-charcoal">4. Payments and Transactions</h2>
          <p>ToroPay facilitates payment links and checkout pages. All payments are processed directly through UPI between the customer and the merchant. ToroPay does not handle, process, or store any payment funds. Transaction data is stored for analytics and record-keeping purposes.</p>

          <h2 className="text-lg font-bold text-charcoal">5. Limitation of Liability</h2>
          <p>ToroPay is provided &quot;as is&quot; without warranty of any kind. The Service shall not be liable for any damages arising from the use of the Service, including but not limited to failed transactions, data loss, or service interruptions.</p>

          <h2 className="text-lg font-bold text-charcoal">6. Termination</h2>
          <p>We reserve the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity.</p>

          <h2 className="text-lg font-bold text-charcoal">7. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

          <h2 className="text-lg font-bold text-charcoal">8. Contact</h2>
          <p>For questions about these terms, please contact us via the support channels available on the platform.</p>
        </div>
      </div>
    </div>
  )
}
