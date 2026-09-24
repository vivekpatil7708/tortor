import { cn } from '@/lib/utils'
import { PackageOpen } from 'lucide-react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/40 px-6 py-12 text-center">
      <PackageOpen className="mb-3 h-10 w-10 text-gray-300" />
      <p className="font-semibold text-gray-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
  )
}