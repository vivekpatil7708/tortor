import Link from 'next/link'

export default function BlogFooter() {
  return (
    <footer className="border-t border-white/10 bg-blue-hero text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
          <div>
            <Link href="/" className="text-lg font-bold tracking-tight text-white">
              Toro<span className="text-sunlit-clay">Pay</span>
            </Link>
            <p className="mt-2 max-w-xs text-sm text-gray-400">Free UPI payment pages for Indian businesses. No transaction fees.</p>
          </div>
          <div className="flex gap-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Product</p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/signup" className="text-sm text-gray-400 transition-colors hover:text-sunlit-clay">Get Started</Link></li>
                <li><Link href="/login" className="text-sm text-gray-400 transition-colors hover:text-sunlit-clay">Log In</Link></li>
                <li><Link href="/dashboard" className="text-sm text-gray-400 transition-colors hover:text-sunlit-clay">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Legal</p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/terms" className="text-sm text-gray-400 transition-colors hover:text-sunlit-clay">Terms</Link></li>
                <li><Link href="/privacy" className="text-sm text-gray-400 transition-colors hover:text-sunlit-clay">Privacy</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Social</p>
              <ul className="mt-3 space-y-2">
                <li><a href="https://instagram.com/toropay.co.in" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-400 transition-colors hover:text-sunlit-clay">Instagram</a></li>
                <li><a href="https://x.com/toropay" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-400 transition-colors hover:text-sunlit-clay">X (Twitter)</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} ToroPay. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
