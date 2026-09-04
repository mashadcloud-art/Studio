import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft } from 'lucide-react'

export function ReportSectionHeader({
  title, monthName, year, month, onYearChange, onMonthChange,
}: {
  title: string
  monthName: string
  year: number
  month: number
  onYearChange: (y: number) => void
  onMonthChange: (m: number) => void
}) {
  const navigate = useNavigate()
  return (
    <div className="flex justify-between items-start flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/reports')}
          aria-label="Back to Reports"
          className="w-9 h-9 rounded-full border border-[#E8DEF8] dark:border-[#382E48] bg-white dark:bg-[#1D192B] flex items-center justify-center cursor-pointer flex-shrink-0 transition-colors hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930]"
        >
          <ArrowLeft size={16} className="text-[#6750A4] dark:text-[#D0BCFF]" />
        </button>
        <div>
          <h1 className="text-[22px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-[-0.5px]">{title}</h1>
          <p className="text-[13px] text-[#49454F] dark:text-[#CAC4D0] mt-[3px]">{monthName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <select value={month} onChange={e => onMonthChange(Number(e.target.value))}
          className="px-3 py-2 rounded-xl border border-[#CAC4D0] dark:border-[#382E48] text-[13px] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#2B2930] outline-none font-sans focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]">
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>
          ))}
        </select>
        <select value={year} onChange={e => onYearChange(Number(e.target.value))}
          className="px-3 py-2 rounded-xl border border-[#CAC4D0] dark:border-[#382E48] text-[13px] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#2B2930] outline-none font-sans focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  )
}
