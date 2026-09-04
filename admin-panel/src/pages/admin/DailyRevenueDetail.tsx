import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useMonthlyReport } from '../../hooks/useReports'
import { Table } from '../../components/ui/Table'
import { ReportSectionHeader } from './ReportSectionHeader'
import { formatCurrency, formatDate } from '../../lib/utils'

interface DailyRow {
  date: string
  amount: number
  transactions: number
}

export function DailyRevenueDetailPage() {
  const [params] = useSearchParams()
  const now = new Date()
  const [year, setYear] = useState(Number(params.get('year')) || now.getFullYear())
  const [month, setMonth] = useState(Number(params.get('month')) || now.getMonth() + 1)

  const { data: report, isLoading } = useMonthlyReport(year, month)
  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy')

  const txnCountByDate = new Map<string, number>()
  for (const r of report?.records ?? []) {
    txnCountByDate.set(r.date, (txnCountByDate.get(r.date) ?? 0) + 1)
  }
  const rows: DailyRow[] = (report?.dailyRevenue ?? [])
    .map(d => ({ date: d.date, amount: d.amount, transactions: txnCountByDate.get(d.date) ?? 0 }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const bestDay = [...(report?.dailyRevenue ?? [])].sort((a, b) => b.amount - a.amount)[0]
  const avgPerDay = (report?.totalRevenue ?? 0) / (report?.dailyRevenue.length || 1)

  return (
    <div className="max-w-full space-y-5">
      <ReportSectionHeader
        title="Daily Revenue" monthName={monthName}
        year={year} month={month} onYearChange={setYear} onMonthChange={setMonth}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Revenue', value: formatCurrency(report?.totalRevenue ?? 0) },
          { label: 'Avg / Day', value: formatCurrency(avgPerDay) },
          { label: 'Best Day', value: bestDay ? `${formatDate(bestDay.date)} · ${formatCurrency(bestDay.amount)}` : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] px-5 py-[18px]">
            <div className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-[0.06em]">{s.label}</div>
            <div className="text-xl font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-[-0.5px] mt-1.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bigger chart */}
      <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
        <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Daily Revenue — {monthName}</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={report?.dailyRevenue ?? []} barSize={18}>
            <CartesianGrid strokeDasharray="2 4" stroke="#E8DEF8" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.split('-')[2]}
              tick={{ fontSize: 11, fill: '#6750A4', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6750A4', fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={60} />
            <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v)), 'Revenue']}
              contentStyle={{ borderRadius: 12, border: '1px solid #D0BCFF', fontSize: 12, fontFamily: 'Inter', background: '#FEF7FF', boxShadow: '0 4px 12px rgba(103,80,164,0.15)' }}
              cursor={{ fill: '#EADDFF', radius: 4 }} />
            <Bar dataKey="amount" fill="#6750A4" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Day-by-day table */}
      <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
        <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Day by Day — {monthName}</div>
        <Table<DailyRow>
          columns={[
            { key: 'date', header: 'Date', render: r => formatDate(r.date) },
            { key: 'transactions', header: 'Transactions' },
            { key: 'amount', header: 'Revenue', render: r => <span className="font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(r.amount)}</span> },
            { key: 'avg', header: 'Avg / Txn', render: r => formatCurrency(r.amount / (r.transactions || 1)) },
          ]}
          data={rows}
          keyExtractor={r => r.date}
          loading={isLoading}
          emptyMessage="No revenue recorded this month"
        />
      </div>
    </div>
  )
}
