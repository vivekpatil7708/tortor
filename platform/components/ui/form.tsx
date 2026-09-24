import { cn } from '@/lib/utils'

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-2.5 text-sm outline-none transition focus:border-charcoal focus:ring-2 focus:ring-charcoal/10'

export function Field({
  label,
  error,
  children,
  required,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return <input {...rest} className={cn(inputClass, className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props
  return <textarea {...rest} className={cn(inputClass, 'min-h-[90px]', className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props
  return <select {...rest} className={cn(inputClass, className)} />
}