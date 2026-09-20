'use client'

interface Props {
  merchantEmail: string
  adminEmail: string
}

export function AdminViewBanner({ merchantEmail, adminEmail }: Props) {
  async function handleExit() {
    await fetch('/api/admin/impersonate/exit', { method: 'POST' })
    window.location.href = '/dashboard'
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>
        Admin view — logged in as <span className="font-bold">{merchantEmail}</span>
        <span className="ml-1 opacity-80">(via {adminEmail})</span>
      </span>
      <button onClick={handleExit}
        className="rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/30">
        Exit merchant view
      </button>
    </div>
  )
}