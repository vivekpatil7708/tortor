'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** A small "Copy" button for a UPI ID or payment reference. */
export default function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard not available (old browser or blocked): the text is still on screen to copy by hand.
    }
  }

  return (
    <button type="button" onClick={copy} aria-label={`${label}: ${text}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${className}`}>
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? 'Copied' : label}
    </button>
  )
}
