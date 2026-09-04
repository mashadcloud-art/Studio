import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useMonthlyReport } from '../../hooks/useReports'
import { Table } from '../../components/ui/Table'
import { ReportSectionHeader } from './ReportSectionHeader'
import { formatCurrency } from '../../lib/utils'

const COLORS = ['#6750A4', '#7F67BE', '#9A82DB', '#B69DF8', '#D0BCFF', '#EADDFF']

interface ServiceRow {
  serviceName: string
  count: number
  revenue: number
}

export function ServicesDetailPage() {
  const [params] = useSearchParams()
  const now = new Date()
  const [year, setYear] = useState(Number(params.get('year')) || now.getFullYear())
  const [month, setMonth] = useState(Number(params.get('month')) || now.getMonth() + 1)

  const { data: report, isLoading } = useMonthlyReport(year, month)
  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy')

  const rows: ServiceRow[] = [...(report?.serviceSummary ?? [])].sort((a, b) => b.revenue - a.revenue)
  const totalServices = rows.reduce((s, r) => s + r.count, 0)
  const topService = rows[0]

  return (
    <div className="max-w-full space-y-5">
      <ReportSectionHeader
        title="Revenue by Service" monthName={monthName}
        year={year} month={month} onYearChange={setYear} onMonthChange={setMonth}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Services Done', value: totalServices },
          { label: 'Distinct Services', value: rows.length },
          { label: 'Top Service', value: topService ? `${topService.serviceName}` : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] px-5 py-[18px]">
            <div className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-[0.06em]">{s.label}</div>
            <div className="text-xl font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-[-0.5px] mt-1.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bigger pie chart */}
      <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
        <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Revenue by Service — {monthName}</div>
        {rows.length === 0 ? (
          <div className="text-center py-10 text-[#79747E] dark:text-[#938F99] text-[13px]">No data</div>
        ) : (
          <div className="grid gap-6 items-center" style={{ gridTemplateColumns: '280px 1fr' }}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={rows} dataKey="revenue" nameKey="serviceName"
                  cx="50%" cy="50%" outerRadius={100} innerRadius={55} label={false}>
                  {rows.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))}
                  contentStyle={{ borderRadius: 12, border: '1px solid #D0BCFF', fontSize: 12, fontFamily: 'Inter', background: '#FEF7FF', boxShadow: '0 4px 12px rgba(103,80,164,0.15)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {rows.map((s, i) => (
                <div key={s.serviceName} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-[13px] text-[#49454F] dark:text-[#CAC4D0] flex-1">{s.serviceName}</span>
                  <span className="text-xs text-[#79747E] dark:text-[#938F99]">{s.count}×</span>
                  <span className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9] w-20 text-right">{formatCurrency(s.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full services table */}
      <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
        <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Services Summary — {monthName}</div>
        <Table<ServiceRow>
          columns={[
            { key: 'serviceName', header: 'Service' },
            { key: 'count', header: 'Times Performed' },
            { key: 'revenue', header: 'Revenue', render: r => <span className="font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(r.revenue)}</span> },
            { key: 'avg', header: 'Avg Price', render: r => formatCurrency(r.revenue / (r.count || 1)) },
          ]}
          data={rows}
          keyExtractor={s => s.serviceName}
          loading={isLoading}
          emptyMessage="No services this month"
        />
      </div>
    </div>
  )
}
