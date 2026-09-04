import React from 'react'
import { cn } from '../../lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color?: 'pink' | 'purple' | 'green' | 'blue' | 'orange' | 'gray'
  trend?: { value: number; label: string }
}

export function StatCard({ title, value, subtitle, icon, color = 'gray', trend }: StatCardProps) {
  const colorMap = {
    pink:   'bg-[#FFD8E4] text-[#31111D] dark:bg-[#58102B] dark:text-[#FFB3C7]',
    purple: 'bg-[#EADDFF] text-[#21005D] dark:bg-[#4F378B] dark:text-[#EADDFF]',
    green:  'bg-[#C4EED0] text-[#146C2E] dark:bg-[#003913] dark:text-[#79DF84]',
    blue:   'bg-[#C2E7FF] text-[#001D35] dark:bg-[#003355] dark:text-[#9CB4CC]',
    orange: 'bg-[#FFDCC2] text-[#361400] dark:bg-[#5C2900] dark:text-[#FFB781]',
    gray:   'bg-[#F3EDF7] text-[#49454F] dark:bg-[#2B2930] dark:text-[#CAC4D0]',
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-[#79747E] dark:text-[#938F99] uppercase tracking-wide">{title}</p>
          <p className="mt-1.5 text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-[#79747E] dark:text-[#938F99]">{subtitle}</p>}
          {trend && (
            <p className={cn('mt-1 text-xs font-semibold', trend.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-xl', colorMap[color])}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

export function CardHeader({ title, subtitle, action }: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{title}</h3>
        {subtitle && <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
