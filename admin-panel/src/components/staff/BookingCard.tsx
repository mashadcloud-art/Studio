import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar, Clock3, MapPin, Wallet, Plus, Play, Square, CheckCircle2, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, getTodayString } from '../../lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface Booking {
  id: string
  customer_name: string
  customer_phone: string
  customer_place: string | null
  booking_date: string
  booking_time: string
  services: { service_id?: string; name: string; price: number }[]
  advance_paid: number
  pending_amount: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes: string | null
  started_at: string | null
  work_record_id?: string | null
}

export function BookingCard({ booking, staffId, services, onStatusChange, onRelease }: {
  booking: Booking
  staffId: string
  services: { id: string; name: string; price: number }[]
  onStatusChange: (id: string, status: string) => void
  onRelease?: (id: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [addingService, setAddingService] = useState(false)
  const [localStatus, setLocalStatus] = useState(booking.status)
  const [localStarted, setLocalStarted] = useState(!!booking.started_at)
  const [workRecordId, setWorkRecordId] = useState<string | null>(booking.work_record_id ?? null)
  const [localServices, setLocalServices] = useState(booking.services ?? [])

  const isStarted = localStarted
  const isCompleted = localStatus === 'completed'
  const serviceNames = localServices.map(s => s.name).join(', ') || 'No services'
  const totalAmount = localServices.reduce((s, sv) => s + sv.price, 0)

  let dateLabel = booking.booking_date
  try { dateLabel = format(parseISO(booking.booking_date), 'EEE, d MMM') } catch { /* keep raw */ }
  const timeLabel = booking.booking_time?.slice(0, 5) ?? booking.booking_time

  const handleStart = async () => {
    setLoading(true)
    try {
      const { data: existing } = await db.from('customers').select('id').eq('phone', booking.customer_phone).maybeSingle()
      let customerId = existing?.id
      if (!customerId) {
        const { data: nc } = await db.from('customers').insert({ name: booking.customer_name, phone: booking.customer_phone }).select('id').single()
        customerId = nc?.id
      }
      const primarySvc = booking.services[0]
      const { data: svcData } = await db.from('services').select('id').eq('name', primarySvc?.name).maybeSingle()
      const serviceId = svcData?.id ?? booking.services[0]?.service_id
      if (!serviceId || !customerId) throw new Error('Missing service or customer')
      const { data: wr } = await db.from('work_records').insert({
        staff_id: staffId, customer_id: customerId, service_id: serviceId,
        start_time: new Date().toISOString(), amount: totalAmount,
        date: getTodayString(), payment_method: 'cash',
        extra_services: booking.services.slice(1),
      }).select('id').single()
      await db.from('bookings').update({
        started_at: new Date().toISOString(), status: 'confirmed', work_record_id: wr?.id ?? null,
      }).eq('id', booking.id)
      setWorkRecordId(wr?.id ?? null)
      setLocalStarted(true)
      setLocalStatus('confirmed')
      toast.success('Session started!')
    } catch (e: unknown) { toast.error((e as Error).message) }
    setLoading(false)
  }

  const qc = useQueryClient()
  const handleStop = async () => {
    setLoading(true)
    try {
      if (workRecordId) {
        await db.from('work_records').update({ end_time: new Date().toISOString() }).eq('id', workRecordId)
      }
      await db.from('bookings').update({ status: 'completed', payment_status: 'unpaid' }).eq('id', booking.id)
      setLocalStatus('completed')
      onStatusChange(booking.id, 'completed')
      qc.invalidateQueries({ queryKey: ['my_assigned_bookings'] })
      qc.invalidateQueries({ queryKey: ['staff_upcoming_bookings_count'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['sidebar_pending_payments'] })
      toast.success('Job done! ✅ Sent to receptionist for payment.')
    } catch (e: unknown) { toast.error((e as Error).message) }
    setLoading(false)
  }

  const handleAddService = async (svcId: string) => {
    const svc = services.find(s => s.id === svcId)
    if (!svc || !workRecordId) return
    setLoading(true)
    try {
      const { data: wr } = await db.from('work_records').select('amount, extra_services').eq('id', workRecordId).single()
      const currentExtras = wr?.extra_services ?? []
      const newExtras = [...currentExtras, { service_id: svc.id, name: svc.name, price: svc.price }]
      await db.from('work_records').update({ amount: (wr?.amount ?? 0) + svc.price, extra_services: newExtras }).eq('id', workRecordId)
      const newServices = [...localServices, { service_id: svc.id, name: svc.name, price: svc.price }]
      await db.from('bookings').update({ services: newServices }).eq('id', booking.id)
      setLocalServices(newServices)
      setAddingService(false)
      toast.success(`Added ${svc.name} — ${formatCurrency(svc.price)}`)
    } catch (e: unknown) { toast.error((e as Error).message) }
    setLoading(false)
  }

  const activeNotCompleted = isStarted && !isCompleted

  return (
    <div
      className={
        isCompleted
          ? 'border border-[#C4EED0] dark:border-[#003913] bg-[#F0FBF3] dark:bg-[#0A1F0F]'
          : isStarted
          ? 'border-2 border-[#6750A4] dark:border-[#D0BCFF] bg-[#6750A4] dark:bg-[#D0BCFF]'
          : 'border border-[#E8DEF8] dark:border-[#382E48] bg-white dark:bg-[#1D192B]'
      }
      style={{ borderRadius: 20, padding: '16px 18px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={activeNotCompleted ? 'text-white dark:text-[#381E72]' : 'text-[#1D1A22] dark:text-[#E6E0E9]'}
              style={{ fontSize: 15, fontWeight: 800 }}
            >
              {booking.customer_name}
            </span>
            {activeNotCompleted && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>IN PROGRESS</span>
              </span>
            )}
            {isCompleted && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: '#d1fae5' }}>
                <CheckCircle2 size={11} color="#16a34a" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>COMPLETED</span>
              </span>
            )}
          </div>
          <div
            className={activeNotCompleted ? 'text-white/75 dark:text-[#381E72]/75' : 'text-[#79747E] dark:text-[#938F99]'}
            style={{ fontSize: 12, marginTop: 2 }}
          >
            {serviceNames}
          </div>
        </div>
        <div
          className={activeNotCompleted ? 'text-white dark:text-[#381E72]' : 'text-[#1D1A22] dark:text-[#E6E0E9]'}
          style={{ fontSize: 16, fontWeight: 800 }}
        >
          {formatCurrency(totalAmount)}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        {[
          { icon: <Calendar size={12} />, text: dateLabel },
          { icon: <Clock3 size={12} />, text: timeLabel },
          ...(booking.customer_place ? [{ icon: <MapPin size={12} />, text: booking.customer_place }] : []),
          ...(booking.pending_amount > 0 ? [{ icon: <Wallet size={12} />, text: `${formatCurrency(booking.pending_amount)} due`, color: '#d97706' }] : []),
        ].map((item, i) => (
          <span
            key={i}
            className={(item as { color?: string }).color ? '' : activeNotCompleted ? 'text-white/70 dark:text-[#381E72]/70' : 'text-[#79747E] dark:text-[#938F99]'}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: (item as { color?: string }).color }}
          >
            {item.icon} {item.text}
          </span>
        ))}
      </div>

      {activeNotCompleted && (
        <div style={{ marginTop: 12 }}>
          {!addingService ? (
            <button
              onClick={() => setAddingService(true)}
              className="text-white/60 dark:text-[#381E72]/60 border-white/20 dark:border-[#381E72]/20"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, background: 'transparent', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
            >
              <Plus size={11} /> Add Another Service
            </button>
          ) : (
            <div style={{ marginTop: 4 }}>
              <div className="text-white/50 dark:text-[#381E72]/50" style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Select service to add:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {services.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => handleAddService(svc.id)}
                    disabled={loading}
                    className="bg-white/10 dark:bg-[#381E72]/10 border-white/20 dark:border-[#381E72]/20 text-white/80 dark:text-[#381E72]/80"
                    style={{ padding: '4px 10px', borderRadius: 99, borderWidth: 1, borderStyle: 'solid', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                  >
                    {svc.name} · {formatCurrency(svc.price)}
                  </button>
                ))}
                <button
                  onClick={() => setAddingService(false)}
                  className="border-white/15 dark:border-[#381E72]/15 text-white/40 dark:text-[#381E72]/40"
                  style={{ padding: '4px 10px', borderRadius: 99, borderWidth: 1, borderStyle: 'solid', background: 'transparent', fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isCompleted && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          {!isStarted ? (
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={handleStart}
                disabled={loading}
                className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] flex-1"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 14, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: loading ? 0.6 : 1 }}
              >
                {loading ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <Play size={14} />}
                Start Session
              </button>
              {onRelease && (
                <button
                  type="button"
                  onClick={() => onRelease(booking.id)}
                  disabled={loading}
                  title="Release this booking so another staff member can take it"
                  className="px-3.5 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <RotateCcw size={13} />
                  <span>Release</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleStop}
              disabled={loading}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 14, border: 'none', background: '#ef4444', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <Square size={14} />}
              Stop & Complete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
