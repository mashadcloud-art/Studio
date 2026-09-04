import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { cn } from '../../lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors',
        'border-[#CAC4D0] bg-[#F3EDF7] dark:border-[#4F378B] dark:bg-[#382E48]',
        className
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 dark:bg-[#D0BCFF]',
          isDark ? 'translate-x-[26px]' : 'translate-x-1'
        )}
      >
        {isDark ? <Moon size={13} className="text-[#381E72]" /> : <Sun size={13} className="text-[#6750A4]" />}
      </span>
    </button>
  )
}
