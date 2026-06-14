import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { nanoid } from 'nanoid'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateTxnId(): string {
  return 'TXN' + Date.now() + nanoid(6).toUpperCase()
}

export function generateSlug(): string {
  return nanoid(10)
}

export function generateApiKey(): string {
  return 'tp_live_' + nanoid(32)
}

export function formatAmount(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN')
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function statusColor(status: string): string {
  switch (status) {
    case 'success': return 'text-green-600 bg-green-50'
    case 'failed': return 'text-red-600 bg-red-50'
    case 'initiated':
    case 'pending': return 'text-amber-600 bg-amber-50'
    case 'refunded': return 'text-orange-600 bg-orange-50'
    default: return 'text-gray-600 bg-gray-50'
  }
}

export function buildUpiUrl(vpa: string, amount: number, txnId: string, note: string): string {
  return `upi://pay?pa=${encodeURIComponent(vpa)}&am=${amount.toFixed(2)}&cu=INR&mode=01&tn=${encodeURIComponent(note)}&tr=${txnId}`
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

export function buttonRadius(style: string) {
  if (style === 'pill') return 'rounded-full'
  if (style === 'square') return 'rounded-lg'
  return 'rounded-xl'
}
