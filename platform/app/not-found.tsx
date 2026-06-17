import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-cream to-beige px-4 text-center">
      <div className="text-8xl font-extrabold tracking-tight text-primary-500">404</div>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-gray-500">The page you're looking for doesn't exist.</p>
      <Link href="/" className="mt-6 rounded-xl bg-charcoal px-6 py-3 text-sm font-semibold text-white hover:opacity-90">
        Go home
      </Link>
    </div>
  )
}
