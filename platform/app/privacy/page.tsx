import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-beige">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Toro<span className="text-primary-500">Pay</span>
        </Link>
      </header>
      <div className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <div className="space-y-6 text-sm leading-relaxed text-gray-600">
          <p><strong>Last updated:</strong> June 2026</p>

          <h2 className="text-lg font-bold text-charcoal">1. Information We Collect</h2>
          <p>We collect information you provide when creating an account, including:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Email address</li>
            <li>Phone number</li>
            <li>Business name</li>
            <li>UPI ID</li>
            <li>Customization preferences (brand colors, logo, background images)</li>
          </ul>

          <h2 className="text-lg font-bold text-charcoal">2. Transaction Data</h2>
          <p>When customers interact with your payment links, we collect and store transaction metadata including amounts, timestamps, customer names, and notes provided during checkout. We do not handle or store actual payment funds or financial account details.</p>

          <h2 className="text-lg font-bold text-charcoal">3. How We Use Your Data</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>To provide and maintain the Service</li>
            <li>To display transaction history and analytics in your dashboard</li>
            <li>To improve and personalize the Service</li>
            <li>To communicate with you about your account</li>
            <li>To prevent fraud and abuse</li>
          </ul>

          <h2 className="text-lg font-bold text-charcoal">4. Data Sharing</h2>
          <p>We do not sell, trade, or transfer your personal data to third parties. We may share data with service providers who assist in operating the Service (e.g., database hosting), bound by confidentiality agreements.</p>

          <h2 className="text-lg font-bold text-charcoal">5. Data Retention</h2>
          <p>We retain your data for as long as your account is active. You may delete your account at any time, which will remove your personal data and transaction records.</p>

          <h2 className="text-lg font-bold text-charcoal">6. Security</h2>
          <p>We implement industry-standard security measures including encryption in transit (TLS), password hashing, and rate limiting on authentication endpoints. However, no method of electronic storage is 100% secure.</p>

          <h2 className="text-lg font-bold text-charcoal">7. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use tracking cookies or third-party analytics cookies.</p>

          <h2 className="text-lg font-bold text-charcoal">8. Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal data at any time through your account dashboard.</p>

          <h2 className="text-lg font-bold text-charcoal">9. Changes to This Policy</h2>
          <p>We may update this policy. Changes will be posted on this page with an updated date.</p>

          <h2 className="text-lg font-bold text-charcoal">10. Contact</h2>
          <p>For privacy-related inquiries, please contact us via the support channels available on the platform.</p>
        </div>
      </div>
    </div>
  )
}
