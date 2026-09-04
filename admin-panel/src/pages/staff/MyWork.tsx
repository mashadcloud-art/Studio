import { useState } from 'react'
import { format } from 'date-fns'
import { DollarSign, Users, TrendingUp, Clock, Check, X, Play, Plus, Banknote, Smartphone } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useWorkRecords, useUpdateWorkRecord } from '../../hooks/useWorkRecords'
import { useServices } from '../../hooks/useServices'
import { Card, StatCard, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatDate, formatTime, calculateDuration, getTodayString, getMonthRange } from '../../lib/utils'
import { differenceInMinutes, parseISO } from 'date-fns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type ViewMode = 'daily' | 'monthly' | 'bookings'

export function MyWork() {
  const { staff } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const c = {
    border: isDark ? '#382E48' : '#E8DEF8',
    surface: isDark ? '#1D192B' : 'white',
    surfaceVariant: isDark ? '#2B2930' : '#F3EDF7',
    surfaceVariantText: isDark ? '#CAC4D0' : '#49454F',
    text: isDark ? '#E6E0E9' : '#1D1A22',
    muted: isDark ? '#CAC4D0' : '#79747E',
    muted2: isDark ? '#CAC4D0' : '#938F99',
    primary: isDark ? '#D0BCFF' : '#6750A4',
    onPrimary: isDark ? '#381E72' : 'white',
    primaryContainer: isDark ? '#4F378B' : '#EADDFF',
    onPrimaryContainer: isDark ? '#EADDFF' : '#21005D',
    successBg: isDark ? '#003913' : '#f0fdf4',
    successText: isDark ? '#79DF84' : '#16a34a',
    infoBg: isDark ? '#003355' : '#eff6ff',
    infoText: isDark ? '#9CB4CC' : '#2563eb',
    warningBg: isDark ? '#3D2E00' : '#fef3c7',
    warningText: isDark ? '#FBC02D' : '#d97706',
  }
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [selectedDate, setSelectedDate] = useState(getTodayString())
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [addingServiceTo, setAddingServiceTo] = useState<string | null>(null)
  const qc = useQueryClient()

  const { start, end } = getMonthRange(year, month)
  const { data: services = [] } = useServices()

  const { data: records = [], isLoading } = useWorkRecords({
    staffId: staff?.id,
    date: viewMode === 'daily' ? selectedDate : undefined,
    startDate: viewMode === 'monthly' ? start : undefined,
    endDate: viewMode === 'monthly' ? end : undefined,
  })

  const updateWork = useUpdateWorkRecord()

  // Unassigned bookings visible to all staff
  const { data: unassignedBookings = [] } = useQuery({
    queryKey: ['unassigned_bookings'],
    queryFn: async () => {
      const { data, error } = await db.from('bookings')
        .select('*')
        .is('assigned_staff_id', null)
        .in('status', ['pending', 'confirmed'])
        .order('booking_date').order('booking_time')
      if (error) throw error
      return data as {
        id: string; customer_name: string; customer_phone: string; customer_place: string | null
        booking_date: string; booking_time: string; services: { name: string; price: number }[]
        advance_paid: number; pending_amount: number; status: string
      }[]
    },
    enabled: viewMode === 'bookings',
  })

  // My assigned bookings
  const { data: myBookings = [] } = useQuery({
    queryKey: ['my_bookings', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return []
      const { data, error } = await db.from('bookings')
        .select('*')
        .eq('assigned_staff_id', staff.id)
        .in('status', ['pending', 'confirmed'])
        .order('booking_date').order('booking_time')
      if (error) throw error
      return data as {
        id: string; customer_name: string; customer_phone: string; customer_place: string | null
        booking_date: string; booking_time: string; services: { name: string; price: number }[]
        advance_paid: number; pending_amount: number; status: string; started_at: string | null
      }[]
    },
    enabled: viewMode === 'bookings',
  })

  const acceptBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await db.from('bookings').update({
        assigned_staff_id: staff?.id,
        status: 'confirmed',
        accepted_by: staff?.id,
      }).eq('id', bookingId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unassigned_bookings'] })
      qc.invalidateQueries({ queryKey: ['my_bookings'] })
      toast.success('Booking accepted!')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const declineBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      // Just mark as declined for this staff (don't delete, just ignore)
      toast('Booking declined')
    },
  })

  const startBooking = useMutation({
    mutationFn: async (booking: typeof myBookings[0]) => {
      // Mark booking as started
      await db.from('bookings').update({ started_at: new Date().toISOString(), status: 'confirmed' }).eq('id', booking.id)
      // Create work record
      const { data: customers } = await db.from('customers')
        .select('id').eq('phone', booking.customer_phone).maybeSingle()
      let customerId = customers?.id
      if (!customerId) {
        const { data: newCustomer } = await db.from('customers').insert({ name: booking.customer_name, phone: booking.customer_phone }).select('id').single()
        customerId = newCustomer?.id
      }
      if (!customerId || !staff?.id) throw new Error('Missing data')
      const primaryService = booking.services[0]
      const { data: serviceData } = await db.from('services').select('id').eq('name', primaryService.name).maybeSingle()
      if (!serviceData?.id) throw new Error('Service not found')
      const total = booking.services.reduce((s: number, svc: { price: number }) => s + svc.price, 0)
      await db.from('work_records').insert({
        staff_id: staff.id, customer_id: customerId, service_id: serviceData.id,
        start_time: new Date().toISOString(), amount: total,
        date: getTodayString(), payment_method: 'cash',
        extra_services: booking.services.slice(1),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_bookings'] })
      qc.invalidateQueries({ queryKey: ['work_records'] })
      toast.success('Session started from booking!')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Add extra service to existing work record
  const addExtraService = async (recordId: string, serviceId: string) => {
    const svc = services.find(s => s.id === serviceId)
    if (!svc) return
    const record = records.find(r => r.id === recordId)
    if (!record) return
    const existing = (record as { extra_services?: { service_id: string; name: string; price: number }[] }).extra_services ?? []
    const newExtras = [...existing, { service_id: svc.id, name: svc.name, price: svc.price }]
    const newAmount = record.amount + svc.price
    await updateWork.mutateAsync({ id: recordId, updates: { amount: newAmount, extra_services: newExtras } as never })
    toast.success(`Added ${svc.name} — ${formatCurrency(svc.price)}`)
    setAddingServiceTo(null)
  }

  const totalRevenue = records.reduce((s, r) => s + r.amount, 0)
  const totalOvertimeMinutes = records.filter(r => r.end_time)
    .reduce((sum, r) => { const w = differenceInMinutes(parseISO(r.end_time!), parseISO(r.start_time)); return sum + Math.max(0, w - 480) }, 0)

  const dailyRevenueData = viewMode === 'monthly'
    ? records.reduce<{ date: string; amount: number }[]>((acc, r) => {
        const ex = acc.find(a => a.date === r.date)
        if (ex) ex.amount += r.amount; else acc.push({ date: r.date, amount: r.amount })
        return acc
      }, []).sort((a, b) => a.date.localeCompare(b.date))
    : []

  return (
    <div style={{ maxWidth: '100%' }} className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: '-0.5px' }}>My Work</h1>
        <p style={{ fontSize: 13, color: c.muted, marginTop: 3 }}>Sessions, bookings, and earnings</p>
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', background: c.surfaceVariant, borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {(['daily', 'monthly', 'bookings'] as const).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontFamily: 'Inter, sans-serif',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            background: viewMode === mode ? c.surface : 'transparent',
            color: viewMode === mode ? c.primary : c.muted,
            boxShadow: viewMode === mode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            textTransform: 'capitalize'
          }}>{mode === 'bookings' ? '📅 Bookings' : mode}</button>
        ))}
      </div>

      {/* ── BOOKINGS TAB ──────────────────────────────────────────────────── */}
      {viewMode === 'bookings' && (
        <div className="space-y-5">

          {/* Unassigned bookings */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 12 }}>
              Open Bookings ({unassignedBookings.length})
              <span style={{ fontSize: 12, fontWeight: 400, color: c.muted, marginLeft: 8 }}>— Accept to take a booking</span>
            </div>
            {unassignedBookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, background: c.surface, borderRadius: 12, border: `1px solid ${c.border}`, color: c.muted2, fontSize: 13 }}>
                No open bookings right now
              </div>
            ) : (
              <div className="space-y-3">
                {unassignedBookings.map(b => (
                  <div key={b.id} style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>{b.customer_name}</div>
                        {b.customer_place && (
                          <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
                            📍 {b.customer_place}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                          <span style={{ fontSize: 12, color: c.muted }}>📅 {format(new Date(b.booking_date), 'EEE, MMM d')}</span>
                          <span style={{ fontSize: 12, color: c.muted }}>⏰ {b.booking_time}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                          {b.services.map((s, i) => (
                            <span key={i} style={{ padding: '3px 10px', background: c.surfaceVariant, borderRadius: 99, fontSize: 11, fontWeight: 600, color: c.surfaceVariantText }}>
                              {s.name} · {formatCurrency(s.price)}
                            </span>
                          ))}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: c.muted }}>
                          Total: <strong style={{ color: c.text }}>{formatCurrency(b.services.reduce((s, sv) => s + sv.price, 0))}</strong>
                          {b.advance_paid > 0 && <> · Advance: <strong style={{ color: c.successText }}>{formatCurrency(b.advance_paid)}</strong> · Pending: <strong style={{ color: '#dc2626' }}>{formatCurrency(b.pending_amount)}</strong></>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button onClick={() => acceptBooking.mutate(b.id)} disabled={acceptBooking.isPending}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, border: 'none', background: c.primary, color: c.onPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                        <Check size={14} /> Accept Booking
                      </button>
                      <button onClick={() => declineBooking.mutate(b.id)}
                        style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${c.border}`, background: c.surface, color: c.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <X size={14} /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My accepted bookings */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 12 }}>
              My Bookings ({myBookings.length})
            </div>
            {myBookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, background: c.surface, borderRadius: 12, border: `1px solid ${c.border}`, color: c.muted2, fontSize: 13 }}>
                No bookings assigned yet
              </div>
            ) : (
              <div className="space-y-3">
                {myBookings.map(b => {
                  const isStarted = !!b.started_at
                  return (
                    <div key={b.id} style={{
                      background: isStarted ? 'linear-gradient(135deg, #381E72 0%, #4F378B 55%, #6750A4 100%)' : c.surface,
                      borderRadius: 14, border: `1px solid ${isStarted ? '#4F378B' : c.border}`, padding: '16px 18px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: isStarted ? 'white' : c.text }}>{b.customer_name}</span>
                            {isStarted && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>IN PROGRESS</span>
                              </span>
                            )}
                          </div>
                          {b.customer_place && (
                            <div style={{ fontSize: 12, color: isStarted ? '#CAC4D0' : c.muted, marginTop: 2 }}>
                              📍 {b.customer_place}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                            <span style={{ fontSize: 12, color: isStarted ? 'rgba(255,255,255,0.5)' : c.muted }}>📅 {format(new Date(b.booking_date), 'EEE, MMM d')}</span>
                            <span style={{ fontSize: 12, color: isStarted ? 'rgba(255,255,255,0.5)' : c.muted }}>⏰ {b.booking_time}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                            {b.services.map((s, i) => (
                              <span key={i} style={{ padding: '3px 10px', background: isStarted ? 'rgba(255,255,255,0.1)' : c.surfaceVariant, borderRadius: 99, fontSize: 11, fontWeight: 600, color: isStarted ? 'rgba(255,255,255,0.7)' : c.surfaceVariantText }}>
                                {s.name} · {formatCurrency(s.price)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: isStarted ? 'white' : c.text, flexShrink: 0 }}>
                          {formatCurrency(b.services.reduce((s, sv) => s + sv.price, 0))}
                        </div>
                      </div>

                      {!isStarted && (
                        <button onClick={() => startBooking.mutate(b)} disabled={startBooking.isPending}
                          style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 10, border: 'none', background: c.primary, color: c.onPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          <Play size={14} /> Start Session Now
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DAILY / MONTHLY TABS ─────────────────────────────────────────── */}
      {viewMode !== 'bookings' && (
        <>
          {/* Date Controls */}
          {viewMode === 'daily' ? (
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif' }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>
                ))}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif' }}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { title: 'Revenue', value: formatCurrency(totalRevenue), icon: <DollarSign size={18} /> },
              { title: 'Customers', value: records.length, icon: <Users size={18} /> },
              { title: 'Completed', value: records.filter(r => r.end_time).length, icon: <TrendingUp size={18} /> },
              { title: 'Overtime', value: `${Math.floor(totalOvertimeMinutes / 60)}h ${totalOvertimeMinutes % 60}m`, icon: <Clock size={18} /> },
            ].map(stat => (
              <div key={stat.title} style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.title}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: '-0.5px', marginTop: 6 }}>{stat.value}</div>
                  </div>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: c.primaryContainer, color: c.onPrimaryContainer, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{stat.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Monthly chart */}
          {viewMode === 'monthly' && dailyRevenueData.length > 0 && (
            <div style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: 14 }}>
                Daily Revenue — {format(new Date(year, month - 1, 1), 'MMMM yyyy')}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyRevenueData} barSize={14}>
                  <CartesianGrid strokeDasharray="2 4" stroke={c.border} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.split('-')[2]} tick={{ fontSize: 11, fill: c.muted2, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: c.muted2, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v)), 'Revenue']} contentStyle={{ borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 12, fontFamily: 'Inter', background: c.surface, color: c.text }} cursor={{ fill: c.surfaceVariant }} />
                  <Bar dataKey="amount" fill={c.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Records list */}
          <div style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
                {viewMode === 'daily' ? `Sessions on ${formatDate(selectedDate)}` : 'All Sessions'}
              </span>
              <span style={{ fontSize: 12, color: c.muted }}>{records.length} records</span>
            </div>

            {isLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ width: 22, height: 22, border: `2px solid ${c.border}`, borderTopColor: c.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
              </div>
            ) : records.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: c.muted2, fontSize: 13 }}>No sessions found</div>
            ) : (
              records.map((r, i) => {
                const pm = (r as { payment_method?: string }).payment_method ?? 'cash'
                const pmIsCash = pm === 'cash'
                const isActive = !r.end_time
                const isAddingExtra = addingServiceTo === r.id
                const extraSvcs = (r as { extra_services?: { name: string; price: number }[] }).extra_services ?? []

                return (
                  <div key={r.id} style={{ borderBottom: i < records.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: c.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.onPrimary, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {(r.customers as { name: string })?.name?.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
                          {(r.customers as { name: string })?.name}
                        </div>
                        <div style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>
                          {(r.services as { name: string })?.name}
                          {extraSvcs.length > 0 && ` + ${extraSvcs.length} more`}
                          {viewMode === 'monthly' && ` · ${formatDate(r.date)}`}
                        </div>
                        <div style={{ fontSize: 11, color: c.muted2, marginTop: 1 }}>
                          {formatTime(r.start_time)}{r.end_time ? ` – ${formatTime(r.end_time)} (${calculateDuration(r.start_time, r.end_time)})` : ' — Active'}
                        </div>

                        {/* Add more services button for active sessions */}
                        {isActive && (
                          <div style={{ marginTop: 8 }}>
                            {!isAddingExtra ? (
                              <button onClick={() => setAddingServiceTo(r.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px dashed #CAC4D0', background: c.surface, fontSize: 11, fontWeight: 600, color: c.muted, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                                <Plus size={11} /> Add Another Service
                              </button>
                            ) : (
                              <div style={{ marginTop: 4 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, marginBottom: 6 }}>Select service to add:</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                  {services.filter(s => s.active).map(svc => (
                                    <button key={svc.id} type="button"
                                      onClick={() => addExtraService(r.id, svc.id)}
                                      style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${c.border}`, background: c.surface, fontSize: 11, fontWeight: 500, color: c.surfaceVariantText, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                                      onMouseEnter={e => { e.currentTarget.style.background = c.primary; e.currentTarget.style.color = c.onPrimary; e.currentTarget.style.borderColor = c.primary }}
                                      onMouseLeave={e => { e.currentTarget.style.background = c.surface; e.currentTarget.style.color = c.surfaceVariantText; e.currentTarget.style.borderColor = c.border }}>
                                      {svc.name} · {formatCurrency(svc.price)}
                                    </button>
                                  ))}
                                  <button onClick={() => setAddingServiceTo(null)}
                                    style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${c.border}`, background: c.surface, fontSize: 11, fontWeight: 500, color: c.muted2, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>{formatCurrency(r.amount)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: pmIsCash ? c.successBg : c.infoBg, color: pmIsCash ? c.successText : c.infoText }}>
                            {pmIsCash ? <Banknote size={8} /> : <Smartphone size={8} />}
                            {pm.toUpperCase()}
                          </div>
                          <div style={{ padding: '2px 6px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: isActive ? c.warningBg : c.successBg, color: isActive ? c.warningText : c.successText }}>
                            {isActive ? 'ACTIVE' : 'DONE'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
