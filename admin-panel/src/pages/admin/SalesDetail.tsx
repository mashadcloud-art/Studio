import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useMonthlyReport } from '../../hooks/useReports'
import { Table } from '../../components/ui/Table'
import { ReportSectionHeader } from './ReportSectionHeader'
import { formatCurrency, formatDate } from '../../lib/utils'

interface SalesRow {
  id: string
  date: string
  staffName: string
  customerName: string
  serviceName: string
  amount: number
}

export function SalesDetailPage() {
  const [params] = useSearchParams()
  const now = new Date()
  const [year, setYear] = useState(Number(params.get('year')) || now.getFullYear())
  const [month, setMonth] = useState(Number(params.get('month')) || now.getMonth() + 1)

  const { data: report, isLoading } = useMonthlyReport(year, month)
  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy')

  const rows: SalesRow[] = (report?.records ?? []).map(r => ({
    id: r.id,
    date: r.date,
    staffName: r.staff?.name ?? '—',
    customerName: r.customers?.name ?? '—',
    serviceName: r.services?.name ?? '—',
    amount: r.amount,
  })).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="max-w-full space-y-5">
      <ReportSectionHeader
        title="Total Sales" monthName={monthName}
        year={year} month={month} onYearChange={setYear} onMonthChange={setMonth}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Revenue', value: formatCurrency(report?.totalRevenue ?? 0) },
          { label: 'Transactions', value: report?.totalCustomers ?? 0 },
          { label: 'Avg / Transaction', value: formatCurrency((report?.totalRevenue ?? 0) / (report?.totalCustomers || 1)) },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] px-5 py-[18px]">
            <div className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-[0.06em]">{s.label}</div>
            <div className="text-[22px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-[-0.5px] mt-1.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Transactions table */}
      <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
        <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">All Transactions — {monthName}</div>
        <Table<SalesRow>
          columns={[
            { key: 'date', header: 'Date', render: r => formatDate(r.date) },
            { key: 'staffName', header: 'Staff' },
            { key: 'customerName', header: 'Customer' },
            { key: 'serviceName', header: 'Service' },
            { key: 'amount', header: 'Amount', render: r => <span className="font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(r.amount)}</span> },
          ]}
          data={rows}
          keyExtractor={r => r.id}
          loading={isLoading}
          emptyMessage="No transactions for this month"
        />
      </div>
    </div>
  )
}
