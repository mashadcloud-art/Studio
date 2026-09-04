import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, DollarSign, Users, Scissors, Loader2, X, Clock, Zap, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useStaffById } from '../../hooks/useStaff'
import { useStaffMonthlyReport } from '../../hooks/useReports'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatCurrencyPDF, formatDate, formatTime, calculateDuration, getMonthRange, minutesToHoursMinutes } from '../../lib/utils'
import { totalWorkedMinutes, groupSessionsByStaffDate, type AttendanceSession } from '../../lib/attendanceHours'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { loadLogoBase64, drawLuxuryPdfHeader, drawSummaryCards, drawSectionHeader, stampLuxuryFooter } from '../../lib/pdfTemplate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface WorkRow {
  id: string
  date: string
  customerName: string
  customerPhone: string
  serviceName: string
  startTime: string
  endTime: string | null
  amount: number
}

export function StaffWorkPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: staff } = useStaffById(id)

  const now = new Date()
  // Opening this page from a specific month in Reports (e.g. clicking a staff
  // row in September's Staff Performance table) should land on that same
  // month here, not silently reset to whatever month it is today.
  const [year, setYear] = useState(() => Number(searchParams.get('year')) || now.getFullYear())
  const [month, setMonth] = useState(() => Number(searchParams.get('month')) || now.getMonth() + 1)
  const [dateFilter, setDateFilter] = useState('') // '' = all dates in the selected month; else 'YYYY-MM-DD'

  const { data: report, isLoading } = useStaffMonthlyReport(id ?? '', year, month)
  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy')

  const { start, end } = getMonthRange(year, month)

  // Attendance + real check-in/check-out hours for the same period — the
  // same three sources Payroll and the Overtime report read from, so this
  // page's numbers always agree with what she's actually paid.
  const { data: attendanceDays = [] } = useQuery({
    queryKey: ['staff_work_attendance', id, year, month],
    queryFn: async () => {
      const { data, error } = await db.from('attendance').select('date, status')
        .eq('staff_id', id).gte('date', start).lte('date', end)
      if (error) throw error
      return data as { date: string; status: string }[]
    },
    enabled: !!id,
  })

  const { data: attendanceSessions = [] } = useQuery({
    queryKey: ['staff_work_sessions', id, year, month],
    queryFn: async () => {
      const { data, error } = await db.from('attendance_sessions').select('staff_id, date, check_in, check_out')
        .eq('staff_id', id).gte('date', start).lte('date', end)
      if (error) throw error
      return data as AttendanceSession[]
    },
    enabled: !!id,
  })

  const { data: overtimeRows = [] } = useQuery({
    queryKey: ['staff_work_overtime', id, year, month],
    queryFn: async () => {
      const { data, error } = await db.from('overtime').select('date, total_minutes')
        .eq('staff_id', id).gte('date', start).lte('date', end)
      if (error) throw error
      return data as { date: string; total_minutes: number }[]
    },
    enabled: !!id,
  })

  const { data: stdHoursSetting } = useQuery({
    queryKey: ['standard_work_hours_setting'],
    queryFn: async () => {
      const { data } = await db.from('settings').select('value').eq('key', 'standard_work_hours').maybeSingle()
      return parseFloat(data?.value ?? '8')
    },
  })
  const stdMinutes = (stdHoursSetting ?? 8) * 60

  const sessionsByDate = groupSessionsByStaffDate(attendanceSessions)
  const approvedOvertimeByDate: Record<string, number> = {}
  overtimeRows.forEach(r => { approvedOvertimeByDate[r.date] = r.total_minutes })

  const daysPresent = attendanceDays.filter(a => ['present', 'late', 'half_day'].includes(a.status)).length
  const daysAbsent = attendanceDays.filter(a => a.status === 'absent').length
  const daysLeave = attendanceDays.filter(a => a.status === 'leave').length

  const totalWorkedMin = Object.values(sessionsByDate).reduce((sum, s) => sum + totalWorkedMinutes(s), 0)
  const approvedOvertimeMin = overtimeRows.reduce((sum, r) => sum + (r.total_minutes ?? 0), 0)
  const regularWorkedMin = Math.max(0, totalWorkedMin - approvedOvertimeMin)
  const overtimePay = Math.round((approvedOvertimeMin / 60) * (staff?.overtime_rate ?? 0) * 100) / 100

  // One row per attended day, combining her status with real hours + approved
  // overtime that day — this is what the PDF/Excel "Attendance" sheet exports.
  const attendanceRows = attendanceDays
    .map(a => {
      const daySessions = sessionsByDate[`${id}__${a.date}`] ?? []
      return {
        date: a.date,
        status: a.status,
        workedMin: totalWorkedMinutes(daySessions),
        overtimeMin: approvedOvertimeByDate[a.date] ?? 0,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  function handleDateChange(value: string) {
    setDateFilter(value)
    if (value) {
      // Keep the month/year selects in sync so the underlying report covers the picked date
      const picked = new Date(value + 'T00:00:00')
      setYear(picked.getFullYear())
      setMonth(picked.getMonth() + 1)
    }
  }

  const allRows: WorkRow[] = (report?.records ?? [])
    .map(r => ({
      id: r.id,
      date: r.date,
      customerName: r.customers?.name ?? 'Unknown client',
      customerPhone: r.customers?.phone ?? '',
      serviceName: r.services?.name ?? 'Unknown service',
      startTime: r.start_time,
      endTime: r.end_time,
      amount: r.amount,
    }))
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))

  const rows = dateFilter ? allRows.filter(r => r.date === dateFilter) : allRows
  const periodLabel = dateFilter ? formatDate(dateFilter) : monthName

  // Aggregates for the summary strip
  const serviceMap = new Map<string, number>()
  for (const r of rows) serviceMap.set(r.serviceName, (serviceMap.get(r.serviceName) ?? 0) + 1)
  const distinctClients = new Set(rows.map(r => r.customerName)).size

  const fileSlug = `${(staff?.name ?? 'staff').replace(/\s+/g, '-').toLowerCase()}-${year}-${String(month).padStart(2, '0')}`

  const exportPDF = async () => {
    if (!staff) return
    const toastId = toast.loading('Generating luxury report...')
    try {
      const logoBase64 = await loadLogoBase64()
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // 1. Luxury Purple & Gold Header Banner
      drawLuxuryPdfHeader({
        doc,
        reportTitle: 'Staff Performance Report',
        subtitle: 'Luxury Nail Care & Beauty Experience',
        staffName: staff.name,
        periodLabel,
        logoBase64,
      })

      // 2. Executive KPI Summary Cards
      const nextY = drawSummaryCards(doc, 48, [
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report?.totalRevenue ?? 0),
          sublabel: `${distinctClients} Clients · ${rows.length} Services`,
          accentColor: [212, 175, 55], // Gold
        },
        {
          label: 'Attendance',
          value: `${daysPresent} Days Present`,
          sublabel: `${daysAbsent} Absent · ${daysLeave} Leave`,
          accentColor: [16, 185, 129], // Emerald
        },
        {
          label: 'Working Hours',
          value: minutesToHoursMinutes(regularWorkedMin),
          sublabel: 'Regular Shift Time',
          accentColor: [103, 80, 164], // Purple
        },
        {
          label: 'Overtime',
          value: minutesToHoursMinutes(approvedOvertimeMin),
          sublabel: `Pay: ${formatCurrencyPDF(overtimePay)}`,
          accentColor: [245, 158, 11], // Amber
        },
      ])

      // 3. Section: Work Log Table
      const workHeaderY = drawSectionHeader(doc, 'SERVICE & WORK RECORDS LOG', nextY + 3, [56, 30, 114])
      autoTable(doc, {
        startY: workHeaderY,
        head: [['DATE', 'CUSTOMER', 'SERVICE PERFORMED', 'TIMING', 'DURATION', 'AMOUNT']],
        body: rows.map(r => [
          formatDate(r.date),
          r.customerName,
          r.serviceName,
          `${formatTime(r.startTime)}${r.endTime ? ` – ${formatTime(r.endTime)}` : ''}`,
          calculateDuration(r.startTime, r.endTime),
          formatCurrencyPDF(r.amount),
        ]),
        foot: [['TOTAL REVENUE', '', '', '', `${rows.length} Services Done`, formatCurrencyPDF(report?.totalRevenue ?? 0)]],
        headStyles: { fillColor: [56, 30, 114], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: [243, 237, 247], textColor: [56, 30, 114], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [252, 250, 255] },
        styles: { fontSize: 8, cellPadding: 2.2, lineColor: [232, 222, 248], lineWidth: 0.1 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { fontStyle: 'bold' },
          4: { halign: 'center' },
          5: { halign: 'right', fontStyle: 'bold', textColor: [56, 30, 114] },
        },
        margin: { left: 14, right: 14 },
      })

      // 4. Section: Attendance Log Table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable.finalY + 8
      const attHeaderY = drawSectionHeader(doc, 'MONTHLY ATTENDANCE & SHIFT BREAKDOWN', finalY, [103, 80, 164])
      autoTable(doc, {
        startY: attHeaderY,
        head: [['DATE', 'ATTENDANCE STATUS', 'HOURS WORKED', 'OVERTIME (APPROVED)']],
        body: attendanceRows.map(a => [
          formatDate(a.date),
          a.status.toUpperCase(),
          minutesToHoursMinutes(a.workedMin),
          a.overtimeMin > 0 ? minutesToHoursMinutes(a.overtimeMin) : '—',
        ]),
        headStyles: { fillColor: [103, 80, 164], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [252, 250, 255] },
        styles: { fontSize: 8, cellPadding: 2, lineColor: [232, 222, 248], lineWidth: 0.1 },
        margin: { left: 14, right: 14 },
      })

      // 5. Stamp Luxury Footer across all pages
      stampLuxuryFooter(doc, `${staff.name.toUpperCase()} PERFORMANCE RECORD`)

      doc.save(`${fileSlug}.pdf`)
      toast.success('Luxury PDF exported!', { id: toastId })
    } catch (e: unknown) {
      toast.error(`Export failed: ${(e as Error).message}`, { id: toastId })
    }
  }

  const exportExcel = () => {
    if (!staff) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      Staff: staff.name, Period: periodLabel,
      Revenue: report?.totalRevenue ?? 0, 'Clients Served': distinctClients, 'Services Done': rows.length,
      'Days Present': daysPresent, 'Days Absent': daysAbsent, 'Days Leave': daysLeave,
      'Regular Hours': minutesToHoursMinutes(regularWorkedMin),
      'Overtime (Approved)': minutesToHoursMinutes(approvedOvertimeMin),
      'Overtime Pay': overtimePay,
    }]), 'Summary')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({
      Date: formatDate(r.date), Customer: r.customerName, Phone: r.customerPhone, Service: r.serviceName,
      Start: formatTime(r.startTime), End: r.endTime ? formatTime(r.endTime) : '',
      Duration: calculateDuration(r.startTime, r.endTime), Amount: r.amount,
    }))), 'Work Log')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendanceRows.map(a => ({
      Date: a.date, Status: a.status,
      'Worked (h)': minutesToHoursMinutes(a.workedMin),
      'Overtime Approved (h)': a.overtimeMin > 0 ? minutesToHoursMinutes(a.overtimeMin) : '',
    }))), 'Attendance')
    XLSX.writeFile(wb, `${fileSlug}.xlsx`)
    toast.success('Excel exported!')
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/staff/${id}`)}
            aria-label="Back to team member"
            className="w-9 h-9 rounded-full border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] flex items-center justify-center shrink-0 hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors"
          >
            <ArrowLeft size={16} className="text-[#1D1A22] dark:text-[#E6E0E9]" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
              {staff ? `${staff.name}'s Work` : 'Staff Work'}
            </h1>
            <p className="text-xs text-[#79747E] dark:text-[#938F99]">{periodLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => { setMonth(Number(e.target.value)); setDateFilter('') }}
            disabled={!!dateFilter}
            className="rounded-lg border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0] text-xs px-2.5 py-1.5 outline-none disabled:opacity-40">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>
            ))}
          </select>
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setDateFilter('') }}
            disabled={!!dateFilter}
            className="rounded-lg border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0] text-xs px-2.5 py-1.5 outline-none disabled:opacity-40">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFilter}
              onChange={e => handleDateChange(e.target.value)}
              className="rounded-lg border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0] text-xs px-2.5 py-1.5 outline-none"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                aria-label="Clear date filter"
                className="w-6 h-6 rounded-full border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] flex items-center justify-center hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors"
              >
                <X size={12} className="text-[#49454F] dark:text-[#938F99]" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportPDF}>PDF</Button>
          <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportExcel}>Excel</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[#CAC4D0]" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-4 text-center">
              <DollarSign size={16} className="text-[#6750A4] dark:text-[#D0BCFF] mx-auto mb-1" />
              <p className="text-xs text-[#79747E] dark:text-[#938F99]">Revenue</p>
              <p className="text-sm font-semibold text-[#1D1A22] dark:text-[#E6E0E9] mt-0.5">{formatCurrency(report?.totalRevenue ?? 0)}</p>
            </div>
            <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-4 text-center">
              <Users size={16} className="text-[#6750A4] dark:text-[#D0BCFF] mx-auto mb-1" />
              <p className="text-xs text-[#79747E] dark:text-[#938F99]">Clients Served</p>
              <p className="text-sm font-semibold text-[#1D1A22] dark:text-[#E6E0E9] mt-0.5">{distinctClients}</p>
            </div>
            <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-4 text-center">
              <Scissors size={16} className="text-[#6750A4] dark:text-[#D0BCFF] mx-auto mb-1" />
              <p className="text-xs text-[#79747E] dark:text-[#938F99]">Services Done</p>
              <p className="text-sm font-semibold text-[#1D1A22] dark:text-[#E6E0E9] mt-0.5">{rows.length}</p>
            </div>
          </div>

          {/* Attendance & hours — always the full month, even while the work
              log above is narrowed to a single day */}
          <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
            <div className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Attendance & Hours — {monthName}</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-[#F3EDF7] dark:bg-[#2B2930] rounded-xl p-3 text-center">
                <p className="text-xs text-[#79747E] dark:text-[#938F99]">Present</p>
                <p className="text-sm font-semibold text-[#16a34a] mt-0.5">{daysPresent}d</p>
              </div>
              <div className="bg-[#F3EDF7] dark:bg-[#2B2930] rounded-xl p-3 text-center">
                <p className="text-xs text-[#79747E] dark:text-[#938F99]">Absent</p>
                <p className="text-sm font-semibold text-[#dc2626] mt-0.5">{daysAbsent}d</p>
              </div>
              <div className="bg-[#F3EDF7] dark:bg-[#2B2930] rounded-xl p-3 text-center">
                <p className="text-xs text-[#79747E] dark:text-[#938F99]">Regular Hours</p>
                <p className="text-sm font-semibold text-[#1D1A22] dark:text-[#E6E0E9] mt-0.5">{minutesToHoursMinutes(regularWorkedMin)}</p>
              </div>
              <div className="bg-[#F3EDF7] dark:bg-[#2B2930] rounded-xl p-3 text-center">
                <p className="text-xs text-[#79747E] dark:text-[#938F99] flex items-center justify-center gap-1"><Zap size={10} /> Overtime</p>
                <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-0.5">{minutesToHoursMinutes(approvedOvertimeMin)}</p>
              </div>
              <div className="bg-[#F3EDF7] dark:bg-[#2B2930] rounded-xl p-3 text-center">
                <p className="text-xs text-[#79747E] dark:text-[#938F99]">Overtime Pay</p>
                <p className="text-sm font-semibold text-[#6750A4] dark:text-[#D0BCFF] mt-0.5">{formatCurrency(overtimePay)}</p>
              </div>
            </div>
            {attendanceRows.length > 0 && (
              <div className="mt-4">
                <Table
                  columns={[
                    { key: 'date', header: 'Date', render: (a: typeof attendanceRows[number]) => formatDate(a.date) },
                    { key: 'status', header: 'Status', render: (a: typeof attendanceRows[number]) => <span className="capitalize">{a.status.replace('_', ' ')}</span> },
                    { key: 'workedMin', header: 'Worked', render: (a: typeof attendanceRows[number]) => a.workedMin > 0 ? minutesToHoursMinutes(a.workedMin) : '—' },
                    {
                      key: 'overtimeMin', header: 'Overtime (Approved)',
                      render: (a: typeof attendanceRows[number]) => a.overtimeMin > 0
                        ? <span className="font-semibold text-orange-600 dark:text-orange-400">{minutesToHoursMinutes(a.overtimeMin)}</span>
                        : <span className="text-[#938F99]">—</span>,
                    },
                  ]}
                  data={attendanceRows}
                  keyExtractor={a => a.date}
                  emptyMessage="No attendance recorded"
                />
              </div>
            )}
          </div>

          {/* Detailed per-visit log */}
          <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
            <div className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Work Log — {periodLabel}</div>
            <Table<WorkRow>
              columns={[
                { key: 'date', header: 'Date', render: r => formatDate(r.date) },
                { key: 'customerName', header: 'Customer', render: r => (
                  <div>
                    <div className="font-medium text-[#1D1A22] dark:text-[#E6E0E9]">{r.customerName}</div>
                    {r.customerPhone && <div className="text-xs text-[#79747E] dark:text-[#938F99]">{r.customerPhone}</div>}
                  </div>
                ) },
                { key: 'serviceName', header: 'Service' },
                { key: 'time', header: 'Time', render: r => (
                  <span>{formatTime(r.startTime)}{r.endTime ? ` – ${formatTime(r.endTime)}` : ''}</span>
                ) },
                { key: 'duration', header: 'Duration', render: r => calculateDuration(r.startTime, r.endTime) },
                { key: 'amount', header: 'Amount', render: r => <span className="font-semibold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(r.amount)}</span> },
              ]}
              data={rows}
              keyExtractor={r => r.id}
              emptyMessage={`No work recorded for ${periodLabel}`}
            />
          </div>

          {/* Services breakdown */}
          {serviceMap.size > 0 && (
            <div className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-5">
              <div className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9] mb-4">Services Breakdown</div>
              <div className="space-y-2">
                {Array.from(serviceMap.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#F3EDF7] dark:bg-[#2B2930]">
                      <span className="text-sm text-[#49454F] dark:text-[#CAC4D0]">{name}</span>
                      <span className="text-xs text-[#79747E] dark:text-[#938F99]">{count}× {dateFilter ? 'this day' : 'this month'}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
