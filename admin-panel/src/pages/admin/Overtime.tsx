import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { Clock, Download, DollarSign } from 'lucide-react'
import { useStaffList } from '../../hooks/useStaff'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader, StatCard } from '../../components/ui/Card'
import { Table } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { minutesToHoursMinutes, getMonthRange, formatCurrency } from '../../lib/utils'
import { totalWorkedMinutes, groupSessionsByStaffDate, type AttendanceSession } from '../../lib/attendanceHours'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const DEFAULT_WORK_HOURS = 8

interface AttendanceDay {
  staff_id: string
  date: string
  ot_status: 'none' | 'pending' | 'approved' | 'rejected'
}

export function OvertimePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [staffFilter, setStaffFilter] = useState('')
  const [stdHours, setStdHours] = useState(DEFAULT_WORK_HOURS)
  const [view, setView] = useState<'summary' | 'overtime'>('summary')

  const { data: staffList = [] } = useStaffList()
  const { start, end } = getMonthRange(year, month)

  // Real overtime is derived from actual check-in/check-out SESSIONS, not
  // individual work-record session lengths (a single service can't be
  // "overtime") and not a single check-in/out pair — a day can hold several
  // sessions (arriving, a lunch break, coming back), and it's their combined
  // hours that decide overtime.
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['attendance-overtime-sessions', start, end, staffFilter],
    queryFn: async () => {
      let query = db.from('attendance_sessions').select('staff_id, date, check_in, check_out')
        .gte('date', start).lte('date', end).not('check_out', 'is', null)
      if (staffFilter) query = query.eq('staff_id', staffFilter)
      const { data, error } = await query
      if (error) throw error
      return data as AttendanceSession[]
    },
  })

  // The approval decision (approved/pending/rejected) still lives on
  // `attendance` — one row per staff per day.
  const { data: days = [] } = useQuery({
    queryKey: ['attendance-overtime-days', start, end, staffFilter],
    queryFn: async () => {
      let query = db.from('attendance').select('staff_id, date, ot_status')
        .gte('date', start).lte('date', end)
      if (staffFilter) query = query.eq('staff_id', staffFilter)
      const { data, error } = await query
      if (error) throw error
      return data as AttendanceDay[]
    },
  })

  const staffById = useMemo(() => {
    const map: Record<string, { name: string; overtime_rate: number }> = {}
    staffList.forEach(s => { map[s.id] = { name: s.name, overtime_rate: s.overtime_rate ?? 0 } })
    return map
  }, [staffList])

  const otStatusByKey = useMemo(() => {
    const map: Record<string, 'none' | 'pending' | 'approved' | 'rejected'> = {}
    days.forEach(d => { map[`${d.staff_id}__${d.date}`] = d.ot_status ?? 'none' })
    return map
  }, [days])

  const sessionsByStaffDate = useMemo(() => groupSessionsByStaffDate(sessions), [sessions])

  // One entry per staff per day that has at least one completed session that
  // day, with the day's combined worked minutes and overtime beyond stdHours.
  const dailyTotals = useMemo(() => {
    return Object.entries(sessionsByStaffDate).map(([key, daySessions]) => {
      const [staffId, date] = key.split('__')
      const worked = totalWorkedMinutes(daySessions)
      const overtime = Math.max(0, worked - stdHours * 60)
      const otStatus = otStatusByKey[key] ?? 'none'
      return { staffId, date, worked, overtime, otStatus }
    })
  }, [sessionsByStaffDate, otStatusByKey, stdHours])

  // Calculate overtime from real attendance sessions. Overtime only gets paid
  // once an admin/receptionist approves that day (see the notification bell /
  // Attendance detail panel) — raw and approved minutes are tracked
  // separately so pending days stay visible without being counted as payable yet.
  const overtimeData = dailyTotals.reduce<Record<string, {
    staffId: string
    staffName: string
    overtimeRate: number
    totalWorked: number
    totalOvertime: number
    approvedOvertime: number
    pendingOvertime: number
    days: number
  }>>((acc, r) => {
    const staffInfo = staffById[r.staffId]
    if (!acc[r.staffId]) {
      acc[r.staffId] = {
        staffId: r.staffId, staffName: staffInfo?.name ?? 'Unknown', overtimeRate: staffInfo?.overtime_rate ?? 0,
        totalWorked: 0, totalOvertime: 0, approvedOvertime: 0, pendingOvertime: 0, days: 0,
      }
    }
    acc[r.staffId].totalWorked += r.worked
    acc[r.staffId].totalOvertime += r.overtime
    if (r.overtime > 0) {
      if (r.otStatus === 'approved') acc[r.staffId].approvedOvertime += r.overtime
      else if (r.otStatus === 'pending') acc[r.staffId].pendingOvertime += r.overtime
    }
    acc[r.staffId].days += 1
    return acc
  }, {})

  const overtimeList = Object.values(overtimeData)
    .map(o => ({ ...o, overtimePay: Math.round((o.approvedOvertime / 60) * o.overtimeRate * 100) / 100 }))
    .sort((a, b) => b.totalOvertime - a.totalOvertime)

  const totalOvertimeMinutes = overtimeList.reduce((s, o) => s + o.approvedOvertime, 0)
  const totalPendingMinutes = overtimeList.reduce((s, o) => s + o.pendingOvertime, 0)
  const totalOvertimePay = overtimeList.reduce((s, o) => s + o.overtimePay, 0)

  // Keep the `overtime` table (staff_id, date, total_minutes) in sync so Payroll
  // can read a stable daily total without recomputing from raw sessions. This is
  // a backup resync for a whole month at once — the moment-of-approval write in
  // useReviewOvertime is what actually makes an approval take effect right away;
  // this just re-confirms it (and clears out anything reversed) when this page
  // happens to be open. Only APPROVED days are written as payable minutes —
  // pending/rejected/none days sync as 0 so a reversed approval clears too.
  useEffect(() => {
    if (!dailyTotals.length) return
    const rows = dailyTotals.map(r => ({
      staff_id: r.staffId,
      date: r.date,
      total_minutes: r.otStatus === 'approved' ? r.overtime : 0,
    }))
    db.from('overtime').upsert(rows, { onConflict: 'staff_id,date' }).then(({ error }: { error: unknown }) => {
      if (error) console.error('Failed to sync overtime table:', error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyTotals])

  const exportExcel = () => {
    const rows = overtimeList.map(o => ({
      Staff: o.staffName,
      'Days Worked': o.days,
      [`Regular Hours (${stdHours}h/day)`]: minutesToHoursMinutes(Math.max(0, o.totalWorked - o.totalOvertime)),
      'Extra Hours Worked': minutesToHoursMinutes(o.totalOvertime),
      'Total Worked': minutesToHoursMinutes(o.totalWorked),
      'Total Overtime': minutesToHoursMinutes(o.totalOvertime),
      'Approved Overtime': minutesToHoursMinutes(o.approvedOvertime),
      'Pending Approval': minutesToHoursMinutes(o.pendingOvertime),
      'Overtime Rate ($/hr)': o.overtimeRate,
      'Overtime Pay (approved only)': o.overtimePay,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Overtime')
    XLSX.writeFile(wb, `overtime-${year}-${String(month).padStart(2, '0')}.xlsx`)
    toast.success('Exported!')
  }

  const monthName = format(new Date(year, month - 1, 1), 'MMMM yyyy')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Overtime Report</h1>
          <p className="text-[#49454F] dark:text-[#CAC4D0] text-sm">{monthName} · from real check-in / check-out times</p>
        </div>
        <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={exportExcel}>
          Export Excel
        </Button>
      </div>

      {/* Controls */}
      <Card className="py-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#49454F] dark:text-[#CAC4D0]">Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#49454F] dark:text-[#CAC4D0]">Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#49454F] dark:text-[#CAC4D0]">Staff</label>
            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className="rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]"
            >
              <option value="">All Staff</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#49454F] dark:text-[#CAC4D0]">Regular Hours/Day</label>
            <input
              type="number"
              value={stdHours}
              min={1}
              max={24}
              onChange={e => setStdHours(Number(e.target.value))}
              className="w-24 rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]"
            />
          </div>
        </div>
        <p className="text-xs text-[#938F99] dark:text-[#CAC4D0] mt-3">
          Anything a staff member works beyond {stdHours}h in a single day (from their real check-in to check-out) counts as overtime.
          It only becomes payable once approved — from the notification bell or a staff member's Attendance detail — so pending days show here but aren't in the total yet.
          Set each staff member's overtime hourly rate on their profile (Team → Edit) to price it out below.
        </p>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          title="Approved Overtime"
          value={minutesToHoursMinutes(totalOvertimeMinutes)}
          icon={<Clock size={22} />}
          color="orange"
          subtitle={monthName}
        />
        <StatCard
          title="Pending Approval"
          value={minutesToHoursMinutes(totalPendingMinutes)}
          icon={<Clock size={22} />}
          color="pink"
          subtitle="Not counted yet"
        />
        <StatCard
          title="Overtime Pay Due"
          value={formatCurrency(totalOvertimePay)}
          icon={<DollarSign size={22} />}
          color="purple"
          subtitle={monthName}
        />
        <StatCard
          title="Staff with Overtime"
          value={overtimeList.filter(o => o.totalOvertime > 0).length}
          icon={<Clock size={22} />}
          color="blue"
        />
        <StatCard
          title="Days Tracked"
          value={dailyTotals.length}
          icon={<Clock size={22} />}
          color="gray"
        />
      </div>

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4 px-4 pt-4 border-b border-[#E8DEF8] dark:border-[#382E48]">
          <div className="pb-4">
            <h3 className="text-[17px] font-black text-[#1D1A22] dark:text-[#E6E0E9] tracking-tight">Staff Overtime Breakdown</h3>
            <p className="text-[13px] font-medium text-[#79747E] dark:text-[#938F99] mt-0.5">{monthName}</p>
          </div>
          <div className="flex bg-[#F3EDF7] dark:bg-[#2B2930] p-1 rounded-lg mb-4">
            <button
              onClick={() => setView('summary')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${view === 'summary' ? 'bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] shadow' : 'text-[#49454F] dark:text-[#CAC4D0]'}`}
            >
              Work Summary
            </button>
            <button
              onClick={() => setView('overtime')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${view === 'overtime' ? 'bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] shadow' : 'text-[#49454F] dark:text-[#CAC4D0]'}`}
            >
              Overtime Pay
            </button>
          </div>
        </div>
        <div className="pb-2">
          <Table
            columns={[
              {
                key: 'staffName',
                header: 'Staff Member',
                render: o => (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] text-xs flex items-center justify-center font-bold">
                      {o.staffName?.charAt(0)}
                    </div>
                    {o.staffName}
                  </div>
                ),
              },
              ...(view === 'summary' ? [
                { key: 'days', header: 'Days Worked', render: (o: any) => o.days },
                {
                  key: 'regularWorked',
                  header: `Regular Hours (${stdHours}h/day)`,
                  render: (o: any) => minutesToHoursMinutes(Math.max(0, o.totalWorked - o.totalOvertime)),
                },
                {
                  key: 'totalOvertime',
                  header: 'Extra Hours Worked',
                  render: (o: any) => o.totalOvertime > 0
                    ? <span className="font-bold text-orange-600 dark:text-orange-400">{minutesToHoursMinutes(o.totalOvertime)}</span>
                    : <span className="text-[#938F99]">—</span>,
                },
                {
                  key: 'totalWorked',
                  header: 'Total Worked',
                  render: (o: any) => <span className="font-bold">{minutesToHoursMinutes(o.totalWorked)}</span>,
                }
              ] : [
                {
                  key: 'approvedOvertime',
                  header: 'Approved',
                  render: (o: any) => (
                    <span className={`font-bold ${o.approvedOvertime > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-[#79747E] dark:text-[#938F99]'}`}>
                      {minutesToHoursMinutes(o.approvedOvertime)}
                    </span>
                  ),
                },
                {
                  key: 'pendingOvertime',
                  header: 'Pending',
                  render: (o: any) => o.pendingOvertime > 0
                    ? <span className="font-bold text-pink-600 dark:text-pink-400">{minutesToHoursMinutes(o.pendingOvertime)}</span>
                    : <span className="text-[#938F99]">—</span>,
                },
                {
                  key: 'overtimeRate',
                  header: 'Rate/hr',
                  render: (o: any) => o.overtimeRate > 0 ? formatCurrency(o.overtimeRate) : <span className="text-[#938F99]">Not set</span>,
                },
                {
                  key: 'overtimePay',
                  header: 'Overtime Pay',
                  render: (o: any) => (
                    <span className="font-bold text-[#6750A4] dark:text-[#D0BCFF]">
                      {formatCurrency(o.overtimePay)}
                    </span>
                  ),
                },
              ])
            ]}
            data={overtimeList}
            keyExtractor={o => o.staffId}
            loading={isLoading}
            emptyMessage="No completed check-in/check-out attendance for selected period"
          />
        </div>
      </Card>
    </div>
  )
}
