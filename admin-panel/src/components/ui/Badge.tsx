import { cn } from '../../lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'pink' | 'gray'
  size?: 'sm' | 'md'
}

export function Badge({ children, variant = 'gray', size = 'md' }: BadgeProps) {
  const variants = {
    green: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    purple: 'bg-[#EADDFF] text-[#21005D] dark:bg-[#4F378B] dark:text-[#EADDFF]',
    pink: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400',
    gray: 'bg-[#F3EDF7] text-[#49454F] dark:bg-[#2B2930] dark:text-[#CAC4D0]',
  }
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full font-medium', variants[variant], sizes[size])}>
      {children}
    </span>
  )
}
