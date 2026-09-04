import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Download, TrendingUp, Users, DollarSign, Scissors, ChevronRight } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { useMonthlyReport } from '../../hooks/useReports'
import { Card, CardHeader, StatCard } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Table } from '../../components/ui/Table'
import { formatCurrency, formatCurrencyPDF } from '../../lib/utils'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const COLORS = ['#6750A4', '#7F67BE', '#9A82DB', '#B69DF8', '#D0BCFF', '#EADDFF']

type StaffSummaryRow = {
  id: string
  staffName: string
  totalAmount: number
  totalCustomers: number
  rank: number
}

export function ReportsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const navigate = useNavigate()
  const periodQuery = `?year=${year}&month=${month}`

  const { data: report, isLoading } = useMonthlyReport(year, month)
  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy')

  const exportPDF = () => {
    if (!report) return
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text(`Monthly Report — ${monthName}`, 14, 20)
    doc.setFontSize(11)
    doc.text(`Total Revenue: ${formatCurrencyPDF(report.totalRevenue)}`, 14, 30)
    doc.text(`Total Customers: ${report.totalCustomers}`, 14, 37)

    doc.setFontSize(14)
    doc.text('Staff Summary', 14, 50)
    autoTable(doc, {
      startY: 55,
      head: [['Staff', 'Customers', 'Revenue']],
      body: report.staffSummary.map(s => [s.staffName, s.totalCustomers, formatCurrencyPDF(s.totalAmount)]),
      headStyles: { fillColor: [103, 80, 164] },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(14)
    doc.text('Service Summary', 14, finalY)
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Service', 'Count', 'Revenue']],
      body: report.serviceSummary.map(s => [s.serviceName, s.count, formatCurrencyPDF(s.revenue)]),
      headStyles: { fillColor: [127, 103, 190] },
    })
    doc.save(`report-${year}-${String(month).padStart(2, '0')}.pdf`)
    toast.success('PDF exported!')
  }

  const exportExcel = () => {
    if (!report) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      report.staffSummary.map(s => ({ Staff: s.staffName, Customers: s.totalCustomers, Revenue: s.totalAmount }))
    ), 'Staff')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      report.serviceSummary.map(s => ({ Service: s.serviceName, Count: s.count, Revenue: s.revenue }))
    ), 'Services')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      report.dailyRevenue.map(d => ({ Date: d.date, Revenue: d.amount }))
    ), 'Daily Revenue')
    XLSX.writeFile(wb, `report-${year}-${String(month).padStart(2, '0')}.xlsx`)
    toast.success('Excel exported!')
  }

  return (
    <div className="max-w-full space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-[-0.5px]">Reports</h1>
          <p className="text-[13px] text-[#49454F] dark:text-[#CAC4D0] mt-[3px]">{monthName}</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Month selector */}
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-[#CAC4D0] dark:border-[#382E48] text-[13px] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#2B2930] outline-none font-sans focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>
            ))}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-[#CAC4D0] dark:border-[#382E48] text-[13px] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#2B2930] outline-none font-sans focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportPDF}>PDF</Button>
          <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportExcel}>Excel</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-[60px]">
          <div className="w-7 h-7 rounded-full border-2 border-[#E8DEF8] dark:border-[#4F378B] animate-spin" style={{ borderTopColor: '#6750A4' }} />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { title: 'Monthly Revenue', value: formatCurrency(report?.totalRevenue ?? 0), icon: <DollarSign size={18} />, sub: monthName, path: `/reports/sales${periodQuery}` },
              { title: 'Total Customers', value: report?.totalCustomers ?? 0, icon: <Users size={18} />, sub: 'This month', path: '/customers' },
              { title: 'Avg Revenue/Day', value: formatCurrency((report?.totalRevenue ?? 0) / (report?.dailyRevenue.length || 1)), icon: <TrendingUp size={18} />, sub: 'Per day', path: `/reports/daily${periodQuery}` },
              { title: 'Services Done', value: report?.serviceSummary.reduce((s, i) => s + i.count, 0) ?? 0, icon: <Scissors size={18} />, sub: 'This month', path: `/reports/services${periodQuery}` },
            ].map(card => (
              <button
                key={card.title}
                onClick={() => navigate(card.path)}
                className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] px-5 py-[18px] text-left cursor-pointer transition-shadow w-full font-sans hover:shadow-[0_4px_14px_rgba(103,80,164,0.12)] hover:border-[#D0BCFF] dark:hover:border-[#4F378B]"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-[0.06em]">{card.title}</div>
                    <div className="text-[22px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-[-0.5px] mt-1.5">{card.value}</div>
                    <div className="text-[11px] text-[#79747E] dark:text-[#938F99] mt-[3px] flex items-center gap-0.5">
                      {card.sub}
                      <ChevronRight size={11} />
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF] flex items-center justify-center">
                    {card.icon}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Charts */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
            {/* Daily revenue bar chart */}
            <div
              onClick={() => navigate(`/reports/daily${periodQuery}`)}
              className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5 cursor-pointer transition-shadow hover:shadow-[0_4px_14px_rgba(103,80,164,0.12)] hover:border-[#D0BCFF] dark:hover:border-[#4F378B]"
            >
              <div className="flex justify-between items-center mb-1">
                <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Daily Revenue</div>
                <ChevronRight size={14} className="text-[#79747E] dark:text-[#938F99]" />
              </div>
              <div className="text-xs text-[#49454F] dark:text-[#CAC4D0] mb-4">{monthName}</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={report?.dailyRevenue ?? []} barSize={14}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#E8DEF8" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.split('-')[2]}
                    tick={{ fontSize: 11, fill: '#6750A4', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6750A4', fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v)), 'Revenue']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #D0BCFF', fontSize: 12, fontFamily: 'Inter', background: '#FEF7FF', boxShadow: '0 4px 12px rgba(103,80,164,0.15)' }}
                    cursor={{ fill: '#EADDFF', radius: 4 }} />
                  <Bar dataKey="amount" fill="#6750A4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart */}
            <div
              onClick={() => navigate(`/reports/services${periodQuery}`)}
              className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5 cursor-pointer transition-shadow hover:shadow-[0_4px_14px_rgba(103,80,164,0.12)] hover:border-[#D0BCFF] dark:hover:border-[#4F378B]"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Revenue by Service</div>
                <ChevronRight size={14} className="text-[#79747E] dark:text-[#938F99]" />
              </div>
              {(report?.serviceSummary.length ?? 0) === 0 ? (
                <div className="text-center py-10 text-[#79747E] dark:text-[#938F99] text-[13px]">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={report?.serviceSummary ?? []} dataKey="revenue" nameKey="serviceName"
                      cx="50%" cy="50%" outerRadius={70} innerRadius={35}
                      label={false}>
                      {report?.serviceSummary.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))}
                      contentStyle={{ borderRadius: 12, border: '1px solid #D0BCFF', fontSize: 12, fontFamily: 'Inter', background: '#FEF7FF', boxShadow: '0 4px 12px rgba(103,80,164,0.15)' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {/* Legend */}
              <div className="flex flex-col gap-1 mt-2">
                {(report?.serviceSummary ?? []).slice(0, 4).map((s, i) => (
                  <div key={s.serviceName} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-[11px] text-[#49454F] dark:text-[#CAC4D0] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{s.serviceName}</span>
                    <span className="text-[11px] font-semibold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(s.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Staff performance table — click a staff member for their full
              report (hours, overtime, clients, work log, PDF/Excel export) */}
          <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Staff Performance — {monthName}</div>
              <div className="text-[11px] text-[#79747E] dark:text-[#938F99]">Click a staff member for their full report</div>
            </div>
            <Table<StaffSummaryRow>
              columns={[
                { key: 'rank', header: '#', render: r => <span className="text-xs font-bold text-[#79747E] dark:text-[#938F99]">{r.rank}</span> },
                { key: 'staffName', header: 'Staff Member', render: r => (
                  <span className="flex items-center gap-1 font-medium text-[#1D1A22] dark:text-[#E6E0E9]">
                    {r.staffName} <ChevronRight size={12} className="text-[#938F99]" />
                  </span>
                ) },
                { key: 'totalCustomers', header: 'Customers', render: r => r.totalCustomers },
                { key: 'totalAmount', header: 'Revenue', render: r => <span className="font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(r.totalAmount)}</span> },
                { key: 'avg', header: 'Avg / Customer', render: r => formatCurrency(r.totalAmount / (r.totalCustomers || 1)) },
              ]}
              data={(report?.staffSummary ?? [])
                .sort((a, b) => b.totalAmount - a.totalAmount)
                .map((s, i) => ({ ...s, rank: i + 1 }))}
              keyExtractor={s => s.id}
              onRowClick={r => navigate(`/staff/${r.id}/work?year=${year}&month=${month}`)}
              emptyMessage="No staff data for this month"
            />
          </div>

          {/* Services table */}
          <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
            <div className="text-[13px] font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Services Summary — {monthName}</div>
            <Table
              columns={[
                { key: 'serviceName', header: 'Service' },
                { key: 'count', header: 'Times Performed' },
                { key: 'revenue', header: 'Revenue', render: r => <span className="font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(r.revenue)}</span> },
                { key: 'avg', header: 'Avg Price', render: r => formatCurrency(r.revenue / (r.count || 1)) },
              ]}
              data={(report?.serviceSummary ?? []).sort((a, b) => b.count - a.count)}
              keyExtractor={s => s.serviceName}
              emptyMessage="No services this month"
            />
          </div>
        </>
      )}
    </div>
  )
}
