import React from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-[#6750A4] text-white hover:bg-[#7F67BE] focus:ring-[#6750A4] dark:bg-[#D0BCFF] dark:text-[#381E72] dark:hover:bg-[#E8DEF8] dark:focus:ring-[#D0BCFF]',
    secondary: 'bg-[#F3EDF7] text-[#1D1A22] hover:bg-[#E8DEF8] focus:ring-[#D0BCFF] dark:bg-[#2B2930] dark:text-[#E6E0E9] dark:hover:bg-[#382E48]',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-[#49454F] hover:bg-[#F3EDF7] focus:ring-[#D0BCFF] dark:text-[#CAC4D0] dark:hover:bg-[#2B2930]',
    outline: 'border border-[#CAC4D0] text-[#49454F] hover:bg-[#F3EDF7] focus:ring-[#D0BCFF] bg-white dark:border-[#44474F] dark:text-[#CAC4D0] dark:hover:bg-[#2B2930] dark:bg-transparent',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-sm',
  }

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  )
}
