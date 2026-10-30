import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
        variant === 'primary' && 'bg-primary-500 text-white shadow-[0_10px_28px_-16px_rgba(37,99,235,0.8)] hover:bg-primary-600',
        variant === 'secondary' && 'border border-blue-100 bg-white text-charcoal hover:bg-blue-50',
        variant === 'ghost' && 'text-gray-500 hover:text-charcoal hover:bg-gray-100',
        variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600',
        size === 'sm' && 'px-4 py-2 text-xs',
        size === 'md' && 'px-5 py-2.5 text-sm',
        size === 'lg' && 'px-6 py-3 text-base',
        className
      )}
      {...props}
    />
  )
}
