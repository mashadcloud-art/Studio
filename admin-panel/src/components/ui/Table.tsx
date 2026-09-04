import React from 'react'
import { cn } from '../../lib/utils'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  loading,
  emptyMessage = 'No data found',
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F3EDF7] dark:bg-[#2B2930] border-b border-[#E8DEF8] dark:border-[#382E48]">
            {columns.map(col => (
              <th
                key={col.key}
                className={cn('px-4 py-3 text-left font-medium text-[#49454F] dark:text-[#CAC4D0]', col.className)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-[#1D192B] divide-y divide-[#F3EDF7] dark:divide-[#2B2930]">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-[#938F99]">
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-[#6750A4] dark:text-[#D0BCFF]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-[#938F99]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map(row => (
              <tr
                key={keyExtractor(row)}
                className={cn(
                  'hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn('px-4 py-3 text-[#1D1A22] dark:text-[#CAC4D0]', col.className)}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
