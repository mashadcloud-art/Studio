import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import {
  Download, ChevronLeft, ChevronRight, MapPin, MapPinOff, ChevronDown, ChevronUp,
  Users, Scissors, Check, X, Clock, Sunrise, Palmtree, MessageCircle, Zap, CheckCircle2, XCircle, Plus,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStaffList } from '../../hooks/useStaff'
import { useWorkRecords } from '../../hooks/useWorkRecords'
import { useReviewOvertime } from '../../hooks/useNotifications'
import { useAuth } from '../../contexts/AuthContext'
import { getTodayString, getMonthRange, minutesToHoursMinutes, calculateDuration } from '../../lib/utils'
import { totalWorkedMinutes } from '../../lib/attendanceHours'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'leave'

interface AttendanceRecord {
  id: string
  staff_id: string
  date: string
  check_in: string | null
  check_out: string | null
  status: AttendanceStatus
  notes: string | null
  location_verified?: boolean
  check_in_lat?: number | null
  check_in_lng?: number | null
  check_out_lat?: number | null
  check_out_lng?: number | null
  ot_status?: 'none' | 'pending' | 'approved' | 'rejected'
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string; short: string; icon: typeof Check }> = {
  present:  { label: 'Present',  color: '#16a34a', bg: '#f0fdf4', short: 'P',  icon: Check    },
  absent:   { label: 'Absent',   color: '#dc2626', bg: '#fef2f2', short: 'A',  icon: X        },
  late:     { label: 'Late',     color: '#d97706', bg: '#fffbeb', short: 'L',  icon: Clock    },
  half_day: { label: 'Half Day', color: '#7c3aed', bg: '#f5f3ff', short: 'H',  icon: Sunrise  },
  leave:    { label: 'Leave',    color: '#0284c7', bg: '#f0f9ff', short: 'LV', icon: Palmtree },
}

export function AttendancePage() {
  const now = new Date()
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily')
  const [selectedDate, setSelectedDate] = useState(getTodayString())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [editingCell, setEditingCell] = useState<{ staffId: string; date: string } | null>(null)
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null)
  const [stdHours, setStdHours] = useState(8)
  // Draft values for the inline "add a session" mini-form, one per staff row.
  const [newSessionDraft, setNewSessionDraft] = useState<Record<string, { in: string; out: string }>>({})
  // Draft checkout datetime for closing a still-open session (e.g. someone
  // forgot to check out and it's now a later day) — keyed by session id.
  const [closeSessionDraft, setCloseSessionDraft] = useState<Record<string, string>>({})

  const qc = useQueryClient()
  const navigate = useNavigate()
  const { staff: currentUser } = useAuth()
  const reviewOvertime = useReviewOvertime()
  const { data: staffList = [] } = useStaffList()
  const activeStaff = staffList.filter(s => s.active && s.role === 'staff')

  const { start, end } = getMonthRange(selectedYear, selectedMonth)

  // Who each staff member served that day, and for how long — for the daily detail panel.
  const { data: dayWorkRecords = [] } = useWorkRecords({ date: selectedDate })
  const clientsByStaff = dayWorkRecords.reduce<Record<string, typeof dayWorkRecords>>((acc, r) => {
    const sid = (r as unknown as { staff_id: string }).staff_id
    if (!acc[sid]) acc[sid] = []
    acc[sid].push(r)
    return acc
  }, {})

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ['attendance', viewMode === 'daily' ? selectedDate : `${selectedYear}-${selectedMonth}`],
    queryFn: async () => {
      const { data, error } = await db.from('attendance').select('*')
        .gte('date', viewMode === 'daily' ? selectedDate : start)
        .lte('date', viewMode === 'daily' ? selectedDate : end)
        .order('date')
      if (error) throw error
      return data as AttendanceRecord[]
    },
  })

  const upsertAttendance = useMutation({
    mutationFn: async (params: {
      staff_id: string; date: string; status: AttendanceStatus
      check_in?: string | null; check_out?: string | null; notes?: string
    }) => {
      // Only include check_in/check_out in the write when the caller
      // explicitly passed them (the time-input fields do this on purpose,
      // including to clear a time with null). A plain status change —
      // clicking a "Present/Absent/Late/…" pill, or "Mark all" — never
      // includes these keys at all, and used to fall back to `?? null`,
      // which silently wiped out a real check-in/check-out time already
      // on the record every time someone just changed the status.
      const payload: Record<string, unknown> = {
        staff_id: params.staff_id, date: params.date, status: params.status,
      }
      if ('check_in' in params) payload.check_in = params.check_in
      if ('check_out' in params) payload.check_out = params.check_out
      if (params.notes !== undefined) payload.notes = params.notes

      const { error } = await db.from('attendance').upsert(payload, { onConflict: 'staff_id,date' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] })
      setEditingCell(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const getRecord = (staffId: string, date: string) =>
    attendance.find(a => a.staff_id === staffId && a.date === date)

  // Real check-in/check-out sessions for the selected day — a staff member
  // can have several (arriving, a lunch break, coming back), and it's their
  // combined hours that decide her worked/overtime totals below, not the
  // single check_in/check_out pair on the day record above (that pair only
  // mirrors the most recent session, for the green "Online" badge).
  interface DaySession { id: string; staff_id: string; date: string; check_in: string; check_out: string | null; location_verified: boolean }
  const { data: daySessions = [] } = useQuery({
    queryKey: ['attendance_sessions_admin', selectedDate],
    queryFn: async () => {
      const { data, error } = await db.from('attendance_sessions').select('*')
        .eq('date', selectedDate).order('check_in', { ascending: true })
      if (error) throw error
      return data as DaySession[]
    },
    enabled: viewMode === 'daily',
  })

  const sessionsByStaff = daySessions.reduce<Record<string, DaySession[]>>((acc, s) => {
    if (!acc[s.staff_id]) acc[s.staff_id] = []
    acc[s.staff_id].push(s)
    return acc
  }, {})

  const addSession = useMutation({
    mutationFn: async ({ staff_id, checkInTime, checkOutTime }: { staff_id: string; checkInTime: string; checkOutTime: string }) => {
      const { error } = await db.from('attendance_sessions').insert({
        staff_id, date: selectedDate,
        check_in: `${selectedDate}T${checkInTime}:00`,
        check_out: checkOutTime ? `${selectedDate}T${checkOutTime}:00` : null,
        location_verified: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance_sessions_admin'] })
      toast.success('Session added')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('attendance_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance_sessions_admin'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  // Manually close a session that's still open (check_out never got set —
  // she forgot to check out, or a session carried over past midnight and her
  // own app could no longer see it to close it herself). Also mirrors the
  // checkout onto that specific day's `attendance` row so the "Online" badge
  // for THAT date clears everywhere else it's read (Team page, chat, her own
  // profile) — but only if that row doesn't already have a check_out, so
  // this never overwrites a real, separately-recorded checkout.
  const closeSession = useMutation({
    mutationFn: async ({ id, staffId, date, checkOutIso }: { id: string; staffId: string; date: string; checkOutIso: string }) => {
      const { error } = await db.from('attendance_sessions').update({ check_out: checkOutIso }).eq('id', id)
      if (error) throw error
      const { error: dayErr } = await db.from('attendance')
        .update({ check_out: checkOutIso })
        .eq('staff_id', staffId).eq('date', date).is('check_out', null)
      if (dayErr) throw dayErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance_sessions_admin'] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
      toast.success('Checked out')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const markAll = async (status: AttendanceStatus) => {
    for (const s of activeStaff) {
      await upsertAttendance.mutateAsync({ staff_id: s.id, date: selectedDate, status })
    }
    toast.success(`Marked all as ${status}`)
  }

  // Monthly summary per staff
  const monthlyStats = activeStaff.map(s => {
    const records = attendance.filter(a => a.staff_id === s.id)
    const present = records.filter(a => a.status === 'present').length
    const absent = records.filter(a => a.status === 'absent').length
    const late = records.filter(a => a.status === 'late').length
    const halfDay = records.filter(a => a.status === 'half_day').length
    const leave = records.filter(a => a.status === 'leave').length
    const totalWorkingDays = present + late + halfDay
    return { staff: s, present, absent, late, halfDay, leave, totalWorkingDays }
  })

  const exportExcel = () => {
    const rows = monthlyStats.map(s => ({
      Name: s.staff.name,
      Present: s.present,
      Absent: s.absent,
      Late: s.late,
      'Half Day': s.halfDay,
      Leave: s.leave,
      'Working Days': s.totalWorkingDays,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Attendance')
    XLSX.writeFile(wb, `attendance-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.xlsx`)
    toast.success('Exported!')
  }

  // Generate days for monthly calendar
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    format(new Date(selectedYear, selectedMonth - 1, i + 1), 'yyyy-MM-dd')
  )

  return (
    <div style={{ maxWidth: '100%' }} className="space-y-5">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Attendance</h1>
          <p className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 13, marginTop: 3 }}>Track staff attendance daily or monthly</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {viewMode === 'monthly' && (
            <button onClick={exportExcel} className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0]" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              <Download size={13} /> Export
            </button>
          )}
        </div>
      </div>

      {/* Toggle */}
      <div className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ display: 'flex', borderRadius: 12, padding: 4, width: 'fit-content', gap: 2 }}>
        {(['daily', 'monthly'] as const).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)}
            className={viewMode === mode ? 'bg-white dark:bg-[#4F378B] text-[#6750A4] dark:text-[#EADDFF]' : 'bg-transparent text-[#49454F] dark:text-[#CAC4D0]'}
            style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontFamily: 'Inter, sans-serif',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: viewMode === mode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            textTransform: 'capitalize'
          }}>{mode}</button>
        ))}
      </div>

      {/* ── DAILY VIEW ── */}
      {viewMode === 'daily' && (
        <>
          {/* Date nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => {
              const d = new Date(selectedDate); d.setDate(d.getDate() - 1)
              setSelectedDate(format(d, 'yyyy-MM-dd'))
            }} className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B]" style={{ padding: '8px 10px', borderRadius: 9, cursor: 'pointer' }}>
              <ChevronLeft size={15} className="text-[#1D1A22] dark:text-[#E6E0E9]" />
            </button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
            <button onClick={() => {
              const d = new Date(selectedDate); d.setDate(d.getDate() + 1)
              setSelectedDate(format(d, 'yyyy-MM-dd'))
            }} className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B]" style={{ padding: '8px 10px', borderRadius: 9, cursor: 'pointer' }}>
              <ChevronRight size={15} className="text-[#1D1A22] dark:text-[#E6E0E9]" />
            </button>
            <span className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 12, marginLeft: 4 }}>
              {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
            </span>
          </div>

          {/* Quick mark all */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12, display: 'flex', alignItems: 'center', marginRight: 4 }}>Mark all:</span>
            {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => markAll(key)}
                style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${cfg.color}20`, background: cfg.bg, fontSize: 11, fontWeight: 700, color: cfg.color, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Staff attendance list */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="border-[#E8DEF8] dark:border-[#382E48]" style={{ width: 22, height: 22, borderWidth: 2, borderStyle: 'solid', borderTopColor: '#6750A4', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : (
            <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, overflow: 'hidden' }}>
              {activeStaff.map((s, i) => {
                const record = getRecord(s.id, selectedDate)
                const status = record?.status
                const cfg = status ? STATUS_CONFIG[status] : null

                const clients = clientsByStaff[s.id] ?? []
                const activeClient = clients.find(c => !(c as unknown as { end_time: string | null }).end_time)
                // "Online" still reads the day record's own check_in/check_out —
                // CheckIn.tsx keeps that mirrored to whichever session is most
                // recent (null check_out = currently on duty), so this needs no
                // change even though hours below now come from real sessions.
                const isOnline = !!record?.check_in && !record?.check_out
                const staffSessions = sessionsByStaff[s.id] ?? []
                const workedMin = totalWorkedMinutes(staffSessions)
                const overtimeMin = Math.max(0, workedMin - stdHours * 60)
                const regularMin = Math.max(0, workedMin - overtimeMin)
                const isExpanded = expandedStaffId === s.id

                // Fallback: actual time spent on client work today, straight from her
                // sessions — this works even when nobody has entered a check-in/check-out
                // time yet, so "hours worked" isn't blocked on manual attendance entry.
                const sessionMin = clients.reduce((sum, c) => {
                  const rec = c as unknown as { start_time: string | null; end_time: string | null }
                  if (!rec.start_time) return sum
                  const end = rec.end_time ? parseISO(rec.end_time) : new Date()
                  return sum + Math.max(0, differenceInMinutes(end, parseISO(rec.start_time)))
                }, 0)

                return (
                  <div key={s.id} className={i < activeStaff.length - 1 ? 'border-b border-[#F3EDF7] dark:border-[#382E48]' : ''}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap'
                  }}>
                    {/* Avatar */}
                    <div style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{s.name.charAt(0)}</div>
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                        {isOnline && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 99, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', animation: 'pulse 2s infinite' }} />
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase' }}>Online</span>
                          </span>
                        )}
                        {status === 'late' && (
                          <span style={{ padding: '2px 7px', borderRadius: 99, background: STATUS_CONFIG.late.bg, fontSize: 9, fontWeight: 800, color: STATUS_CONFIG.late.color, textTransform: 'uppercase' }}>Late</span>
                        )}
                        {overtimeMin > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 99, background: record?.ot_status === 'approved' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)' }}>
                            <Zap size={9} color={record?.ot_status === 'approved' ? '#16a34a' : '#d97706'} />
                            <span style={{ fontSize: 9, fontWeight: 800, color: record?.ot_status === 'approved' ? '#16a34a' : '#d97706', textTransform: 'uppercase' }}>
                              {record?.ot_status === 'approved' ? 'OT approved' : record?.ot_status === 'rejected' ? 'OT rejected' : 'OT pending'}
                            </span>
                          </span>
                        )}
                      </div>
                      {staffSessions.length > 0 && (
                        <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, marginTop: 3 }}>
                          {staffSessions.length === 1 ? (
                            <>
                              In: {format(parseISO(staffSessions[0].check_in), 'HH:mm')}
                              {staffSessions[0].check_out && ` · Out: ${format(parseISO(staffSessions[0].check_out), 'HH:mm')}`}
                            </>
                          ) : (
                            `${staffSessions.length} sessions today`
                          )}
                          {workedMin > 0 && ` · ${minutesToHoursMinutes(workedMin)}`}
                          {overtimeMin > 0 && <span className="text-orange-600 dark:text-orange-400"> ({minutesToHoursMinutes(overtimeMin)} OT)</span>}
                        </div>
                      )}
                      {activeClient ? (
                        <div style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, color: '#7c3aed' }}>
                          <Scissors size={11} /> With client now
                          {clients.length > 1 && ` · ${clients.length} served today`}
                        </div>
                      ) : clients.length > 0 && (
                        <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Users size={11} /> {clients.length} client{clients.length !== 1 ? 's' : ''} served
                        </div>
                      )}
                    </div>

                    {/* Status control — segmented icon pills instead of raw letter boxes */}
                    <div className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 12 }}>
                      {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, c]) => {
                        const Icon = c.icon
                        const active = status === key
                        return (
                          <button key={key} onClick={() => upsertAttendance.mutate({ staff_id: s.id, date: selectedDate, status: key })}
                            title={c.label}
                            style={{
                              width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: active ? c.color : 'transparent',
                              color: active ? '#fff' : c.color,
                              opacity: active ? 1 : 0.55,
                              boxShadow: active ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                              transition: 'all 0.15s',
                            }}>
                            <Icon size={14} strokeWidth={2.5} />
                          </button>
                        )
                      })}
                    </div>

                    {/* Add a session — a staff member can have several in one
                        day (arriving, a lunch break, coming back); each is
                        its own row here, listed with a delete option in
                        Details below. */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="time"
                        value={newSessionDraft[s.id]?.in ?? ''}
                        placeholder="In"
                        onChange={e => setNewSessionDraft(d => ({ ...d, [s.id]: { in: e.target.value, out: d[s.id]?.out ?? '' } }))}
                        className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                        style={{ width: 74, padding: '5px 6px', borderRadius: 8, fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                      <input type="time"
                        value={newSessionDraft[s.id]?.out ?? ''}
                        placeholder="Out"
                        onChange={e => setNewSessionDraft(d => ({ ...d, [s.id]: { in: d[s.id]?.in ?? '', out: e.target.value } }))}
                        className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                        style={{ width: 74, padding: '5px 6px', borderRadius: 8, fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                      <button
                        title="Add session"
                        disabled={!newSessionDraft[s.id]?.in || addSession.isPending}
                        onClick={() => {
                          const draft = newSessionDraft[s.id]
                          if (!draft?.in) return
                          addSession.mutate({ staff_id: s.id, checkInTime: draft.in, checkOutTime: draft.out })
                          setNewSessionDraft(d => { const next = { ...d }; delete next[s.id]; return next })
                        }}
                        className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#6750A4] dark:text-[#D0BCFF]"
                        style={{ width: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newSessionDraft[s.id]?.in ? 'pointer' : 'default', opacity: newSessionDraft[s.id]?.in ? 1 : 0.4 }}>
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* Chat — jump straight to this staff member's thread */}
                    <button
                      onClick={() => navigate(`/staff/${s.id}/chat`)}
                      title={`Chat with ${s.name.split(' ')[0]}`}
                      className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#6750A4] dark:text-[#D0BCFF]"
                      style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <MessageCircle size={14} />
                    </button>

                    {/* Details toggle */}
                    <button
                      onClick={() => setExpandedStaffId(isExpanded ? null : s.id)}
                      className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0]"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                      Details {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {/* Expanded detail panel: location + hours breakdown + clients served */}
                  {isExpanded && (
                    <div className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ margin: '0 18px 14px', borderRadius: 14, padding: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: clients.length ? 14 : 0 }}>
                        <div>
                          <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Check-in Location</div>
                          {record?.check_in ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {record.location_verified
                                ? <MapPin size={13} className="text-green-600 dark:text-green-400" />
                                : <MapPinOff size={13} className="text-amber-600 dark:text-amber-400" />}
                              <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 12, fontWeight: 600 }}>
                                {record.location_verified ? 'Verified at studio' : 'Not verified'}
                              </span>
                              {record.check_in_lat != null && record.check_in_lng != null && (
                                <span className="text-[#938F99] dark:text-[#79747E]" style={{ fontSize: 10 }}>
                                  ({record.check_in_lat.toFixed(4)}, {record.check_in_lng.toFixed(4)})
                                </span>
                              )}
                            </div>
                          ) : <span className="text-[#938F99]" style={{ fontSize: 12 }}>—</span>}
                        </div>
                        <div>
                          <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Check-out Location</div>
                          {record?.check_out ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {record.check_out_lat != null
                                ? <MapPin size={13} className="text-green-600 dark:text-green-400" />
                                : <MapPinOff size={13} className="text-amber-600 dark:text-amber-400" />}
                              <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 12, fontWeight: 600 }}>
                                {record.check_out_lat != null ? 'Location recorded' : 'Not recorded'}
                              </span>
                              {record.check_out_lat != null && record.check_out_lng != null && (
                                <span className="text-[#938F99] dark:text-[#79747E]" style={{ fontSize: 10 }}>
                                  ({record.check_out_lat.toFixed(4)}, {record.check_out_lng.toFixed(4)})
                                </span>
                              )}
                            </div>
                          ) : <span className="text-[#938F99]" style={{ fontSize: 12 }}>—</span>}
                        </div>
                        <div>
                          <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Hours Breakdown</div>
                          {workedMin > 0 ? (
                            <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 12, fontWeight: 600 }}>
                              {minutesToHoursMinutes(regularMin)} regular
                              {overtimeMin > 0 && <span className="text-orange-600 dark:text-orange-400"> + {minutesToHoursMinutes(overtimeMin)} overtime</span>}
                            </div>
                          ) : sessionMin > 0 ? (
                            <div>
                              <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 12, fontWeight: 600 }}>
                                ~{minutesToHoursMinutes(sessionMin)} worked today
                                {activeClient && <span className="text-[#7c3aed]"> (still with a client)</span>}
                              </div>
                              <div className="text-[#938F99] dark:text-[#79747E]" style={{ fontSize: 10, marginTop: 2 }}>
                                from {clients.length} client session{clients.length !== 1 ? 's' : ''} · no check-in/out time entered yet
                              </div>
                            </div>
                          ) : (
                            <span className="text-[#938F99]" style={{ fontSize: 12 }}>No attendance or client sessions recorded yet</span>
                          )}
                        </div>
                      </div>

                      {/* Sessions today — every real check-in/check-out cycle, each
                          removable on its own (e.g. a duplicate or a manual mistake). */}
                      {staffSessions.length > 0 && (
                        <div style={{ marginBottom: clients.length || overtimeMin > 0 ? 14 : 0 }}>
                          <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Sessions Today ({staffSessions.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {staffSessions.map(sess => (
                              <div key={sess.id} className="bg-white dark:bg-[#1D192B]" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 9, fontSize: 12, gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontWeight: 700 }}>
                                    {format(parseISO(sess.check_in), 'HH:mm')} → {sess.check_out ? format(parseISO(sess.check_out), 'HH:mm') : 'ongoing'}
                                  </span>
                                  {!sess.location_verified && <MapPinOff size={11} className="text-amber-600 dark:text-amber-400" />}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {/* Still open — this is what closes a session she never checked
                                      out of (still today, or carried over from an earlier date
                                      her own app can no longer see). Pick when she actually left. */}
                                  {!sess.check_out && (
                                    <>
                                      <input type="datetime-local"
                                        value={closeSessionDraft[sess.id] ?? ''}
                                        onChange={e => setCloseSessionDraft(d => ({ ...d, [sess.id]: e.target.value }))}
                                        className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
                                        style={{ padding: '4px 6px', borderRadius: 7, fontSize: 11, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                                      <button
                                        title="Set checkout time and close this session"
                                        disabled={!closeSessionDraft[sess.id] || closeSession.isPending}
                                        onClick={() => {
                                          const val = closeSessionDraft[sess.id]
                                          if (!val) return
                                          closeSession.mutate({ id: sess.id, staffId: sess.staff_id, date: sess.date, checkOutIso: `${val}:00` })
                                          setCloseSessionDraft(d => { const next = { ...d }; delete next[sess.id]; return next })
                                        }}
                                        className="bg-[#16a34a] text-white"
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: closeSessionDraft[sess.id] ? 'pointer' : 'default', opacity: closeSessionDraft[sess.id] ? 1 : 0.4, fontFamily: 'Inter, sans-serif' }}>
                                        <Check size={11} /> Check Out
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => deleteSession.mutate(sess.id)}
                                    title="Remove this session"
                                    className="text-[#938F99] dark:text-[#79747E]"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Overtime approval — the moment they cross the standard shift, this shows
                          up as pending; it only counts toward Overtime/Payroll once approved. */}
                      {overtimeMin > 0 && record && (
                        <div className="bg-white dark:bg-[#1D192B]" style={{ borderRadius: 12, padding: 12, marginBottom: clients.length ? 14 : 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Zap size={13} color={record.ot_status === 'approved' ? '#16a34a' : record.ot_status === 'rejected' ? '#dc2626' : '#d97706'} />
                            <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 12, fontWeight: 700 }}>
                              {minutesToHoursMinutes(overtimeMin)} overtime —{' '}
                              {record.ot_status === 'approved' ? 'approved, counted toward pay'
                                : record.ot_status === 'rejected' ? 'rejected, not counted'
                                : 'awaiting approval'}
                            </span>
                          </div>
                          {record.ot_status === 'pending' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => currentUser && reviewOvertime.mutate({ attendanceId: record.id, status: 'approved', reviewerId: currentUser.id })}
                                disabled={reviewOvertime.isPending}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                                <CheckCircle2 size={12} /> Approve
                              </button>
                              <button
                                onClick={() => currentUser && reviewOvertime.mutate({ attendanceId: record.id, status: 'rejected', reviewerId: currentUser.id })}
                                disabled={reviewOvertime.isPending}
                                className="border border-[#CAC4D0] dark:border-[#44474F] text-[#49454F] dark:text-[#CAC4D0]"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', background: 'transparent' }}>
                                <XCircle size={12} /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {clients.length > 0 && (
                        <div>
                          <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Clients Served ({clients.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {clients.map((c: unknown) => {
                              const rec = c as { id: string; customers?: { name: string }; services?: { name: string }; start_time: string; end_time: string | null }
                              return (
                                <div key={rec.id} className="bg-white dark:bg-[#1D192B]" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 9, fontSize: 12 }}>
                                  <Scissors size={12} className="text-[#6750A4] dark:text-[#D0BCFF] shrink-0" />
                                  <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontWeight: 600 }}>{rec.customers?.name ?? 'Customer'}</span>
                                  <span className="text-[#79747E] dark:text-[#938F99]">· {rec.services?.name ?? 'Service'}</span>
                                  <span className="text-[#938F99] dark:text-[#CAC4D0]" style={{ marginLeft: 'auto' }}>{calculateDuration(rec.start_time, rec.end_time)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )
              })}
              {activeStaff.length === 0 && (
                <div className="text-[#79747E] dark:text-[#938F99]" style={{ padding: '32px 0', textAlign: 'center', fontSize: 13 }}>No active staff found</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── MONTHLY VIEW ── */}
      {viewMode === 'monthly' && (
        <>
          {/* Month selector */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
              className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
              style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>
              ))}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
              className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
              style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {monthlyStats.map(s => (
              <div key={s.staff.id} className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 16, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]" style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                    {s.staff.name.charAt(0)}
                  </div>
                  <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.staff.name}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {[
                    { label: 'Present', value: s.present, color: '#16a34a' },
                    { label: 'Absent', value: s.absent, color: '#dc2626' },
                    { label: 'Late', value: s.late, color: '#d97706' },
                    { label: 'Leave', value: s.leave, color: '#0284c7' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ textAlign: 'center', padding: '6px', borderRadius: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                      <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Attendance grid */}
          <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr className="bg-[#F3EDF7] dark:bg-[#2B2930]">
                  <th className="text-[#49454F] dark:text-[#CAC4D0] border-b border-[#E8DEF8] dark:border-[#382E48] bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 0, zIndex: 1 }}>
                    Staff
                  </th>
                  {days.map(d => (
                    <th key={d} className="text-[#49454F] dark:text-[#CAC4D0] border-b border-[#E8DEF8] dark:border-[#382E48]" style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, fontSize: 10, minWidth: 32 }}>
                      {format(parseISO(d), 'd')}
                    </th>
                  ))}
                  <th className="text-[#49454F] dark:text-[#CAC4D0] border-b border-[#E8DEF8] dark:border-[#382E48] bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>Days</th>
                </tr>
              </thead>
              <tbody>
                {activeStaff.map((s, si) => (
                  <tr key={s.id} className={si < activeStaff.length - 1 ? 'border-b border-[#F3EDF7] dark:border-[#382E48]' : ''}>
                    <td className="text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]" style={{ padding: '8px 16px', fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, whiteSpace: 'nowrap' }}>
                      {s.name}
                    </td>
                    {days.map(d => {
                      const rec = getRecord(s.id, d)
                      const cfg = rec ? STATUS_CONFIG[rec.status] : null
                      return (
                        <td key={d} style={{ padding: '4px', textAlign: 'center' }}>
                          <div
                            onClick={() => setEditingCell({ staffId: s.id, date: d })}
                            title={cfg?.label ?? 'Not marked'}
                            className={cfg ? '' : 'bg-[#F3EDF7] dark:bg-[#2B2930] border-[#E8DEF8] dark:border-[#382E48] text-[#CAC4D0] dark:text-[#938F99]'}
                            style={{
                              width: 24, height: 24, borderRadius: 6, margin: '0 auto',
                              background: cfg?.bg,
                              borderWidth: 1, borderStyle: 'solid',
                              borderColor: cfg ? cfg.color + '30' : undefined,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, fontWeight: 800, color: cfg?.color,
                              cursor: 'pointer', transition: 'all 0.1s'
                            }}>
                            {cfg?.short ?? '·'}
                          </div>
                          {/* Inline status picker */}
                          {editingCell?.staffId === s.id && editingCell?.date === d && (
                            <div className="bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F]" style={{ position: 'absolute', zIndex: 100, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'flex', gap: 4 }}>
                              {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, c]) => (
                                <button key={key} onClick={() => { upsertAttendance.mutate({ staff_id: s.id, date: d, status: key }); setEditingCell(null) }}
                                  style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${c.color}20`, background: c.bg, cursor: 'pointer', fontSize: 9, fontWeight: 800, color: c.color }}>
                                  {c.short}
                                </button>
                              ))}
                              <button onClick={() => setEditingCell(null)} className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#79747E] dark:text-[#938F99]" style={{ width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontSize: 10 }}>×</button>
                            </div>
                          )}
                        </td>
                      )
                    })}
                    <td className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800 }}>
                      {monthlyStats.find(m => m.staff.id === s.id)?.totalWorkingDays ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: cfg.bg, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: cfg.color }}>{cfg.short}</div>
                <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12 }}>{cfg.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
