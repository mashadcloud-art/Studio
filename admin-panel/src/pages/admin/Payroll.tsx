import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { DollarSign, CheckCircle2, Clock, Download, Pencil, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStaffList } from '../../hooks/useStaff'
import { formatCurrency, getMonthRange, minutesToHoursMinutes } from '../../lib/utils'
import { totalWorkedMinutes, groupSessionsByStaffDate, type AttendanceSession } from '../../lib/attendanceHours'
import { Input, TextArea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface PayrollRecord {
  id: string
  staff_id: string
  month: number
  year: number
  base_salary: number
  working_days: number
  present_days: number
  absent_days: number
  overtime_hours: number
  overtime_pay: number
  bonus: number
  deductions: number
  net_salary: number
  status: 'pending' | 'paid'
  paid_at: string | null
  notes: string | null
}

interface PayrollForm {
  base_salary: number
  working_days: number
  present_days: number
  absent_days: number
  overtime_hours: number
  overtime_pay: number
  bonus: number
  deductions: number
  notes: string
}

export function PayrollPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [editingPayroll, setEditingPayroll] = useState<{ staffId: string; record?: PayrollRecord } | null>(null)
  const [form, setForm] = useState<PayrollForm>({
    base_salary: 0, working_days: 26, present_days: 0,
    absent_days: 0, overtime_hours: 0, overtime_pay: 0,
    bonus: 0, deductions: 0, notes: ''
  })

  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: staffList = [] } = useStaffList()
  const activeStaff = staffList.filter(s => s.active && s.role === 'staff')
  const { start, end } = getMonthRange(selectedYear, selectedMonth)

  const { data: payrollRecords = [], isLoading } = useQuery({
    queryKey: ['payroll', selectedYear, selectedMonth],
    queryFn: async () => {
      const { data, error } = await db.from('payroll').select('*')
        .eq('month', selectedMonth).eq('year', selectedYear)
      if (error) throw error
      return data as PayrollRecord[]
    },
  })

  const { data: attendanceData = [] } = useQuery({
    queryKey: ['attendance_for_payroll', selectedYear, selectedMonth],
    queryFn: async () => {
      const { data, error } = await db.from('attendance').select('*')
        .gte('date', start).lte('date', end)
      if (error) throw error
      return data as { staff_id: string; date: string; status: string }[]
    },
  })

  // Real check-in/check-out sessions for the month — a day can hold several
  // (arriving, a lunch break, coming back), and it's their combined hours
  // that decide how much of a day's pay was actually earned.
  const { data: attendanceSessions = [] } = useQuery({
    queryKey: ['attendance_sessions_for_payroll', selectedYear, selectedMonth],
    queryFn: async () => {
      const { data, error } = await db.from('attendance_sessions').select('staff_id, date, check_in, check_out')
        .gte('date', start).lte('date', end)
      if (error) throw error
      return data as AttendanceSession[]
    },
  })

  const { data: stdHoursSetting } = useQuery({
    queryKey: ['standard_work_hours_setting'],
    queryFn: async () => {
      const { data } = await db.from('settings').select('value').eq('key', 'standard_work_hours').maybeSingle()
      return parseFloat(data?.value ?? '8')
    },
  })
  const stdMinutes = (stdHoursSetting ?? 8) * 60

  const sessionsByStaffDate = useMemo(() => groupSessionsByStaffDate(attendanceSessions), [attendanceSessions])

  // A day's pay credit: 1.0 for a full day, a proportional fraction for a
  // short day, 0 for absent/leave. When real check-in/out sessions exist for
  // that day, the fraction comes straight from actual hours worked — 8h
  // (standard) = full credit, 7h = 7/8 credit, capped at 1.0 so working extra
  // doesn't inflate the day itself (that's what overtime pay is for). When no
  // sessions were ever recorded for a day marked present/late (attendance
  // taken the old way, without GPS check-in), it falls back to exactly what
  // the status already implied: 1.0 for present/late, 0.5 for half day — so
  // days that were never hour-tracked are priced exactly as before.
  const dayCreditsFor = (staffId: string) => {
    const staffAttendance = attendanceData.filter(a => a.staff_id === staffId)
    let credits = 0
    let absentDays = 0
    for (const a of staffAttendance) {
      if (a.status === 'absent') { absentDays++; continue }
      if (a.status === 'leave') continue
      if (!['present', 'late', 'half_day'].includes(a.status)) continue
      const daySessions = sessionsByStaffDate[`${staffId}__${a.date}`] ?? []
      if (daySessions.length > 0) {
        credits += Math.min(1, totalWorkedMinutes(daySessions) / stdMinutes)
      } else {
        credits += a.status === 'half_day' ? 0.5 : 1
      }
    }
    return { credits: Math.round(credits * 100) / 100, absentDays }
  }

  // Real overtime, kept in sync by the Overtime report page (attendance → `overtime` table).
  // Payroll reads it as a ready-made monthly total per staff, priced with each staff
  // member's own overtime_rate — no re-deriving it from raw check-in/out here.
  const { data: overtimeRows = [] } = useQuery({
    queryKey: ['overtime_for_payroll', selectedYear, selectedMonth],
    queryFn: async () => {
      const { data, error } = await db.from('overtime').select('staff_id, date, total_minutes')
        .gte('date', start).lte('date', end)
      if (error) throw error
      return data as { staff_id: string; date: string; total_minutes: number }[]
    },
  })

  const computedOvertimeByStaff = useMemo(() => {
    const totals: Record<string, number> = {}
    overtimeRows.forEach(r => { totals[r.staff_id] = (totals[r.staff_id] ?? 0) + (r.total_minutes ?? 0) })
    const result: Record<string, { minutes: number; hours: number; pay: number }> = {}
    activeStaff.forEach(s => {
      const minutes = totals[s.id] ?? 0
      const hours = Math.round((minutes / 60) * 100) / 100
      const pay = Math.round(hours * (s.overtime_rate ?? 0) * 100) / 100
      result[s.id] = { minutes, hours, pay }
    })
    return result
  }, [overtimeRows, activeStaff])

  // Pay is priced directly off day-credits earned (present_days), not off
  // deducting for absences from a full month — a day worth 0.875 of a
  // credit (7h of an 8h standard) pays 0.875 of a day's rate, same as a
  // day worth 1.0 pays a full day and a day worth 0 (absent) pays nothing.
  const savePayroll = useMutation({
    mutationFn: async ({ staffId, data }: { staffId: string; data: PayrollForm }) => {
      const perDayRate = data.base_salary / data.working_days
      const netSalary = perDayRate * data.present_days - data.deductions + data.overtime_pay + data.bonus
      const { error } = await db.from('payroll').upsert({
        staff_id: staffId, month: selectedMonth, year: selectedYear,
        base_salary: data.base_salary, working_days: data.working_days,
        present_days: data.present_days, absent_days: data.absent_days,
        overtime_hours: data.overtime_hours, overtime_pay: data.overtime_pay,
        bonus: data.bonus, deductions: data.deductions,
        net_salary: Math.max(0, netSalary), notes: data.notes, status: 'pending',
      }, { onConflict: 'staff_id,month,year' })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll'] }); toast.success('Payroll saved'); setEditingPayroll(null) },
    onError: (e: Error) => toast.error(e.message),
  })

  const markPaid = useMutation({
    mutationFn: async (payrollId: string) => {
      const { error } = await db.from('payroll').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payrollId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll'] }); toast.success('Marked as paid!') },
  })

  const generateAll = async () => {
    for (const s of activeStaff) {
      const existing = payrollRecords.find(p => p.staff_id === s.id)
      if (existing) continue // skip if already generated
      const { credits, absentDays } = dayCreditsFor(s.id)
      const ot = computedOvertimeByStaff[s.id]
      await savePayroll.mutateAsync({
        staffId: s.id,
        data: {
          base_salary: s.salary, working_days: 26, present_days: credits,
          absent_days: absentDays, overtime_hours: ot?.hours ?? 0, overtime_pay: ot?.pay ?? 0,
          bonus: 0, deductions: 0, notes: ''
        }
      })
    }
    toast.success('Payroll generated for all staff!')
  }

  const openEdit = (staffId: string) => {
    const s = staffList.find(st => st.id === staffId)
    const existing = payrollRecords.find(p => p.staff_id === staffId)
    const { credits, absentDays } = dayCreditsFor(staffId)
    const ot = computedOvertimeByStaff[staffId]
    setForm({
      base_salary: existing?.base_salary ?? s?.salary ?? 0,
      working_days: existing?.working_days ?? 26,
      present_days: existing?.present_days ?? credits,
      absent_days: existing?.absent_days ?? absentDays,
      // Auto-seeded from real attendance overtime (Overtime report) × the staff member's
      // overtime rate. Only used as the starting value — still freely editable below.
      overtime_hours: existing?.overtime_hours ?? ot?.hours ?? 0,
      overtime_pay: existing?.overtime_pay ?? ot?.pay ?? 0,
      bonus: existing?.bonus ?? 0,
      deductions: existing?.deductions ?? 0,
      notes: existing?.notes ?? '',
    })
    setEditingPayroll({ staffId, record: existing })
  }

  // Net salary calculation preview
  const previewNet = () => {
    const perDayRate = form.base_salary / (form.working_days || 1)
    return Math.max(0, perDayRate * form.present_days - form.deductions + form.overtime_pay + form.bonus)
  }

  const totalNetSalary = payrollRecords.reduce((s, p) => s + p.net_salary, 0)
  const totalPaid = payrollRecords.filter(p => p.status === 'paid').reduce((s, p) => s + p.net_salary, 0)
  const totalPending = payrollRecords.filter(p => p.status === 'pending').reduce((s, p) => s + p.net_salary, 0)

  const exportExcel = () => {
    const rows = payrollRecords.map(p => {
      const s = staffList.find(st => st.id === p.staff_id)
      return {
        'Staff': s?.name ?? p.staff_id,
        'Month': format(new Date(p.year, p.month - 1, 1), 'MMMM yyyy'),
        'Base Salary': p.base_salary,
        'Working Days': p.working_days,
        'Present Days': p.present_days,
        'Absent Days': p.absent_days,
        'Overtime Hours': p.overtime_hours,
        'Overtime Pay': p.overtime_pay,
        'Bonus': p.bonus,
        'Deductions': p.deductions,
        'Net Salary': p.net_salary,
        'Status': p.status,
      }
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Payroll')
    XLSX.writeFile(wb, `payroll-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.xlsx`)
    toast.success('Exported!')
  }

  const monthName = format(new Date(selectedYear, selectedMonth - 1, 1), 'MMMM yyyy')

  return (
    <div style={{ maxWidth: '100%' }} className="space-y-5">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Payroll</h1>
          <p className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 13, marginTop: 3 }}>{monthName} — Salary management</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
            className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
            style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
            style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={generateAll} className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]" style={{ padding: '8px 14px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Auto Generate
          </button>
          <button onClick={exportExcel} className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0]" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Payroll', value: formatCurrency(totalNetSalary), color: '#6750A4', icon: <DollarSign size={18} /> },
          { label: 'Paid', value: formatCurrency(totalPaid), color: '#16a34a', icon: <CheckCircle2 size={18} /> },
          { label: 'Pending', value: formatCurrency(totalPending), color: '#d97706', icon: <Clock size={18} /> },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginTop: 6, color: c.label === 'Total Payroll' ? undefined : c.color }} className={c.label === 'Total Payroll' ? 'text-[#6750A4] dark:text-[#D0BCFF]' : ''}>{c.value}</div>
            </div>
            <div className={`bg-[#F3EDF7] dark:bg-[#2B2930] ${c.label === 'Total Payroll' ? 'text-[#6750A4] dark:text-[#D0BCFF]' : ''}`} style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.label === 'Total Payroll' ? undefined : c.color }}>{c.icon}</div>
          </div>
        ))}
      </div>

      {/* Payroll table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="border-[#E8DEF8] dark:border-[#382E48]" style={{ width: 22, height: 22, borderWidth: 2, borderStyle: 'solid', borderTopColor: '#6750A4', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, overflow: 'hidden' }}>
          {activeStaff.map((s, i) => {
            const record = payrollRecords.find(p => p.staff_id === s.id)
            const isPaid = record?.status === 'paid'
            return (
              <div key={s.id}
                className={`${i < activeStaff.length - 1 ? 'border-b border-[#F3EDF7] dark:border-[#382E48]' : ''} ${isPaid ? 'bg-[#f0fdf4] dark:bg-[#062e17]' : 'bg-white dark:bg-[#1D192B]'}`}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                {/* Avatar */}
                <div style={{ width: 42, height: 42, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                  {s.avatar_url
                    ? <img src={s.avatar_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>{s.name.charAt(0)}</div>
                  }
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                  {record ? (
                    <div style={{ display: 'flex', gap: 14, marginTop: 3, flexWrap: 'wrap' }}>
                      {[
                        { l: 'Base', v: formatCurrency(record.base_salary) },
                        { l: 'Present', v: `${record.present_days}d` },
                        { l: 'Absent', v: `${record.absent_days}d`, c: record.absent_days > 0 ? '#dc2626' : undefined },
                        { l: 'OT', v: `${record.overtime_hours}h` },
                        ...(record.bonus > 0 ? [{ l: 'Bonus', v: formatCurrency(record.bonus), c: '#16a34a' }] : []),
                        ...(record.deductions > 0 ? [{ l: 'Ded.', v: formatCurrency(record.deductions), c: '#dc2626' }] : []),
                      ].map(item => (
                        <span key={item.l} className={(item as { c?: string }).c ? '' : 'text-[#49454F] dark:text-[#CAC4D0]'} style={{ fontSize: 11, color: (item as { c?: string }).c }}>
                          <span className="text-[#79747E] dark:text-[#938F99]" style={{ fontWeight: 600 }}>{item.l}: </span>
                          <span style={{ fontWeight: 700 }}>{item.v}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 11, marginTop: 2 }}>Not generated · Base: {formatCurrency(s.salary)}</div>
                  )}
                </div>

                {/* Net salary */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className={isPaid ? 'text-[#16a34a]' : 'text-[#1D1A22] dark:text-[#E6E0E9]'} style={{ fontSize: 18, fontWeight: 800 }}>
                    {record ? formatCurrency(record.net_salary) : formatCurrency(s.salary)}
                  </div>
                  {record && (
                    <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, color: isPaid ? '#16a34a' : '#d97706', textTransform: 'uppercase' }}>
                      {isPaid ? `✓ Paid ${record.paid_at ? format(new Date(record.paid_at), 'MMM d') : ''}` : 'Pending'}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => navigate(`/staff/${s.id}/chat`)} title={`Chat with ${s.name.split(' ')[0]}`} className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B]" style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <MessageCircle size={13} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                  </button>
                  <button onClick={() => openEdit(s.id)} className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B]" style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Pencil size={13} className="text-[#49454F] dark:text-[#CAC4D0]" />
                  </button>
                  {record && !isPaid && (
                    <button onClick={() => markPaid.mutate(record.id)} disabled={markPaid.isPending}
                      className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]"
                      style={{ padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {activeStaff.length === 0 && (
            <div className="text-[#79747E] dark:text-[#938F99]" style={{ padding: '32px 0', textAlign: 'center', fontSize: 13 }}>No active staff</div>
          )}
        </div>
      )}

      {/* Edit/Create Modal */}
      <Modal
        open={!!editingPayroll}
        onClose={() => setEditingPayroll(null)}
        title={`Payroll — ${staffList.find(s => s.id === editingPayroll?.staffId)?.name ?? ''} · ${monthName}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingPayroll(null)}>Cancel</Button>
            <Button onClick={() => editingPayroll && savePayroll.mutate({ staffId: editingPayroll.staffId, data: form })} loading={savePayroll.isPending}>
              Save Payroll
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Base Salary (₹)</label>
              <input type="number" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: parseFloat(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Working Days</label>
              <input type="number" value={form.working_days} onChange={e => setForm(f => ({ ...f, working_days: parseInt(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Present Days</label>
              <input type="number" value={form.present_days} onChange={e => setForm(f => ({ ...f, present_days: parseInt(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Absent Days</label>
              <input type="number" value={form.absent_days} onChange={e => setForm(f => ({ ...f, absent_days: parseInt(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Overtime Hours</label>
              <input type="number" step="0.5" value={form.overtime_hours} onChange={e => setForm(f => ({ ...f, overtime_hours: parseFloat(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
              {editingPayroll && computedOvertimeByStaff[editingPayroll.staffId]?.minutes > 0 && (
                <div className="text-[#938F99] dark:text-[#79747E]" style={{ fontSize: 10, marginTop: 4 }}>
                  From attendance: {minutesToHoursMinutes(computedOvertimeByStaff[editingPayroll.staffId].minutes)} this month
                </div>
              )}
            </div>
            <div>
              <label className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Overtime Pay (₹)</label>
              <input type="number" value={form.overtime_pay} onChange={e => setForm(f => ({ ...f, overtime_pay: parseFloat(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
              {editingPayroll && computedOvertimeByStaff[editingPayroll.staffId]?.minutes > 0 && (
                <div className="text-[#938F99] dark:text-[#79747E]" style={{ fontSize: 10, marginTop: 4 }}>
                  Suggested: {formatCurrency(computedOvertimeByStaff[editingPayroll.staffId].pay)} at their overtime rate
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Bonus (₹)</label>
              <input type="number" value={form.bonus} onChange={e => setForm(f => ({ ...f, bonus: parseFloat(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Deductions (₹)</label>
              <input type="number" value={form.deductions} onChange={e => setForm(f => ({ ...f, deductions: parseFloat(e.target.value) || 0 }))}
                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', resize: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Net salary preview */}
          <div className="bg-[#6750A4] dark:bg-[#D0BCFF]" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 16 }}>
            <div>
              <div className="text-white/75 dark:text-[#381E72]/75" style={{ fontSize: 12 }}>
                {formatCurrency(form.base_salary)} base
                {form.absent_days > 0 && ` − ${formatCurrency((form.base_salary / (form.working_days || 1)) * form.absent_days)} absent`}
                {form.deductions > 0 && ` − ${formatCurrency(form.deductions)} ded.`}
                {form.overtime_pay > 0 && ` + ${formatCurrency(form.overtime_pay)} OT`}
                {form.bonus > 0 && ` + ${formatCurrency(form.bonus)} bonus`}
              </div>
              <div className="text-white/55 dark:text-[#381E72]/55" style={{ fontSize: 11, marginTop: 2 }}>Net Salary</div>
            </div>
            <div className="text-white dark:text-[#381E72]" style={{ fontSize: 26, fontWeight: 900 }}>{formatCurrency(previewNet())}</div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
