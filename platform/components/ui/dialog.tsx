'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn(
          'max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl',
          wide ? 'max-w-3xl' : 'max-w-lg'
        )}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="mb-5 text-sm text-gray-600">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
            danger ? 'bg-red-500 hover:bg-red-600' : 'bg-charcoal hover:opacity-90'
          )}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}