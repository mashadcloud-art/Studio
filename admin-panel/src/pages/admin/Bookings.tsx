import { useState, useMemo } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Phone, MapPin, Clock, Calendar, User, Trash2, Check, X, Eye, ChevronLeft, ChevronRight, Banknote, CreditCard, Smartphone, Pencil } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useStaffList } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { Input } from '../../components/ui/Input'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { formatCurrency, formatDate, toTitleCase } from '../../lib/utils'
import { invalidateFinancialQueries } from '../../lib/queryInvalidation'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday } from 'date-fns'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface Booking {
  id: string
  customer_name: string
  customer_phone: string
  customer_place: string | null
  booking_date: string
  booking_time: string
  services: { service_id: string; name: string; price: number }[]
  advance_paid: number
  pending_amount: number
  assigned_staff_id: string | null
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
  work_record_id?: string | null
  staff?: { id: string; name: string }
}

const schema = z.object({
  customer_name: z.string().min(2, 'Name required'),
  customer_phone: z.string().min(6, 'Phone required'),
  customer_place: z.string().optional(),
  booking_date: z.string().min(1, 'Date required'),
  booking_time: z.string().min(1, 'Time required'),
  services: z.array(z.object({
    service_id: z.string().min(1),
    name: z.string(),
    price: z.coerce.number(),
  })).min(1, 'Add at least one service'),
  advance_paid: z.coerce.number().min(0),
  assigned_staff_id: z.string().optional(),
  payment_method: z.enum(['cash', 'card', 'gpay', 'upi', 'other']),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const PAYMENT_METHODS: { id: FormData['payment_method']; label: string; icon: React.ReactNode }[] = [
  { id: 'cash', label: 'Cash', icon: <Banknote size={14} /> },
  { id: 'gpay', label: 'GPay', icon: <Smartphone size={14} /> },
  { id: 'upi', label: 'UPI', icon: <Smartphone size={14} /> },
  { id: 'card', label: 'Card', icon: <CreditCard size={14} /> },
  { id: 'other', label: 'Other', icon: <Banknote size={14} /> },
]

const statusConfig = {
  pending:   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400',  label: 'Pending'   },
  confirmed: { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500',   label: 'Confirmed' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500',label: 'Completed' },
  cancelled: { bg: 'bg-gray-50',    text: 'text-gray-500',   border: 'border-gray-200',   dot: 'bg-gray-400',   label: 'Cancelled' },
} as const

export function BookingsPage() {
  const [showModal, setShowModal] = useState(false)
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null)
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null)
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [timePeriod, setTimePeriod] = useState<'morning'|'afternoon'|'evening'>('morning')

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 }),
  })

  const qc = useQueryClient()
  const { data: staffList = [] } = useStaffList()
  const { data: services = [] } = useServices()

  // Fetch all bookings for the visible calendar month to show indicators and appointment times on date cells
  const monthStart = format(startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthEnd = format(endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const { data: monthBookings = [] } = useQuery({
    queryKey: ['bookings_month_indicators', monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await db
        .from('bookings')
        .select('id, customer_name, booking_date, booking_time, status, services')
        .gte('booking_date', monthStart)
        .lte('booking_date', monthEnd)
        .neq('status', 'cancelled')
      if (error) {
        console.error('calendar bookings error:', error)
        return []
      }
      return data ?? []
    },
  })

  // Map of booking_date -> list of bookings
  const bookingsByDate = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, any[]>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monthBookings.forEach((b: any) => {
      if (!b.booking_date) return
      const list = map.get(b.booking_date) || []
      list.push(b)
      map.set(b.booking_date, list)
    })
    return map
  }, [monthBookings])

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', filterStatus, filterDate],
    queryFn: async () => {
      let query = db.from('bookings')
        .select('*, staff:assigned_staff_id(id, name)')
        .order('booking_date').order('booking_time')
      if (filterStatus !== 'all') query = query.eq('status', filterStatus)
      if (filterDate) query = query.eq('booking_date', filterDate)
      const { data, error } = await query
      if (error) throw error
      return data as Booking[]
    },
  })

  const createBooking = useMutation({
    mutationFn: async (data: FormData) => {
      const totalServices = data.services.reduce((s, svc) => s + (parseFloat(String(svc.price)) || 0), 0)
      
      // Auto-upsert customer into directory
      if (data.customer_phone) {
        try {
          await db.from('customers').upsert({
            name: toTitleCase(data.customer_name),
            phone: data.customer_phone,
            address: data.customer_place ? toTitleCase(data.customer_place) : null,
          }, { onConflict: 'phone' })
        } catch { /* ignore customer upsert error */ }
      }

      const { data: result, error } = await db.from('bookings').insert({
        customer_name: toTitleCase(data.customer_name),
        customer_phone: data.customer_phone,
        customer_place: data.customer_place ? toTitleCase(data.customer_place) : null,
        booking_date: data.booking_date,
        booking_time: data.booking_time,
        services: data.services,
        advance_paid: data.advance_paid,
        pending_amount: Math.max(0, totalServices - data.advance_paid),
        assigned_staff_id: data.assigned_staff_id || null,
        payment_method: data.payment_method,
        notes: data.notes || null,
        status: data.status || 'pending',
      }).select().single()
      if (error) throw error
      return result
    },
    onSuccess: () => {
      invalidateFinancialQueries(qc)
      toast.success('Booking created!')
      setShowModal(false)
      reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateBooking = useMutation({
    mutationFn: async (data: FormData & { id: string }) => {
      const totalServices = data.services.reduce((s, svc) => s + (parseFloat(String(svc.price)) || 0), 0)
      const { error } = await db.from('bookings').update({
        customer_name: toTitleCase(data.customer_name),
        customer_phone: data.customer_phone,
        customer_place: data.customer_place ? toTitleCase(data.customer_place) : null,
        booking_date: data.booking_date,
        booking_time: data.booking_time,
        services: data.services,
        advance_paid: data.advance_paid,
        pending_amount: Math.max(0, totalServices - data.advance_paid),
        assigned_staff_id: data.assigned_staff_id || null,
        payment_method: data.payment_method,
        status: data.status,
        notes: data.notes || null,
      }).eq('id', data.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateFinancialQueries(qc)
      toast.success('Booking updated!')
      setShowModal(false)
      setEditingBookingId(null)
      reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteBooking = useMutation({
    mutationFn: async (b: Booking) => {
      // 1. Delete the work_record actually linked to this booking (set on
      // start-session via bookings.work_record_id) — this is the reliable
      // link; a booking's session can otherwise survive deletion and keep
      // showing up on the Dashboard's Today's Sessions / Work Records.
      if (b.work_record_id) {
        await db.from('work_records').delete().eq('id', b.work_record_id)
      }
      // 2. Best-effort cleanup for older bookings created before the FK
      // link existed, where the work_record can only be guessed by notes.
      await db.from('work_records').delete().or(`notes.ilike.%${b.customer_phone}%,notes.ilike.%${b.id}%`)
      // 3. Delete the booking
      const { error } = await db.from('bookings').delete().eq('id', b.id)
      if (error) throw error
    },
    // Deleting a booking touches revenue, cash, payment collection, payroll
    // and every dashboard/report screen that summarizes bookings —
    // invalidateFinancialQueries clears all of them together in one place
    // instead of this screen having to guess which other screens are
    // reading stale data (that's exactly how "cash still showing" bugs
    // like this one happen).
    onSuccess: () => {
      invalidateFinancialQueries(qc)
      toast.success('Booking & associated sale completely deleted!')
      setDeletingBooking(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from('bookings').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings_month_indicators'] })
    },
  })

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      booking_date: format(new Date(), 'yyyy-MM-dd'),
      booking_time: '10:00',
      services: [],
      advance_paid: 0,
      payment_method: 'cash',
      status: 'pending',
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'services' })
  const watchServices = watch('services')
  const watchAdvance = watch('advance_paid')
  const watchTime = watch('booking_time')
  const watchPaymentMethod = watch('payment_method')
  const watchStatus = watch('status')
  const totalAmount = watchServices.reduce((s, svc) => s + (parseFloat(String(svc.price)) || 0), 0)
  const pendingAmount = Math.max(0, totalAmount - (parseFloat(String(watchAdvance)) || 0))

  const pendingCount = bookings.filter(b => b.status === 'pending').length
  const todayCount = bookings.filter(b => b.booking_date === format(new Date(), 'yyyy-MM-dd')).length

  const startEditBooking = (b: Booking) => {
    setEditingBookingId(b.id)
    reset({
      customer_name: b.customer_name,
      customer_phone: b.customer_phone,
      customer_place: b.customer_place || '',
      booking_date: b.booking_date,
      booking_time: b.booking_time?.slice(0, 5) || '10:00',
      services: (b.services || []).map(s => ({
        service_id: s.service_id,
        name: s.name,
        price: s.price,
      })),
      advance_paid: b.advance_paid || 0,
      assigned_staff_id: b.assigned_staff_id || '',
      payment_method: (b as any).payment_method || 'cash',
      status: (b.status as any) || 'pending',
      notes: b.notes || '',
    })
    setShowModal(true)
  }

  const onSubmit = (data: FormData) => {
    if (editingBookingId) {
      updateBooking.mutate({ ...data, id: editingBookingId })
    } else {
      createBooking.mutate(data)
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Bookings</h1>
          <p className="text-sm text-[#79747E] dark:text-[#938F99] mt-0.5">
            {pendingCount} pending · {todayCount} today
          </p>
        </div>
        <button
          onClick={() => {
            setEditingBookingId(null)
            const targetDate = filterDate || format(new Date(), 'yyyy-MM-dd')
            const isPast = targetDate < format(new Date(), 'yyyy-MM-dd')
            reset({
              booking_date: targetDate,
              booking_time: '10:00',
              services: [],
              advance_paid: 0,
              payment_method: 'cash',
              status: isPast ? 'completed' : 'pending',
              customer_name: '',
              customer_phone: '',
              customer_place: '',
              notes: '',
            })
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] text-sm font-semibold rounded-xl hover:bg-[#7F67BE] dark:hover:bg-[#E8DEF8] transition-colors"
        >
          <Plus size={15} />
          New Booking
        </button>
      </div>

      {/* Calendar */}
      <div className="bg-white dark:bg-[#1D192B] rounded-[28px] border border-[#E8DEF8] dark:border-[#382E48] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCalendarMonth(m => subMonths(m, 1))}
            className="p-2 rounded-xl hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] text-[#79747E] dark:text-[#938F99] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{format(calendarMonth, 'MMMM yyyy')}</p>
            <p className="text-[11px] text-[#79747E] dark:text-[#938F99]">
              {monthBookings.length} total appointment{monthBookings.length !== 1 ? 's' : ''} this month
            </p>
          </div>
          <button
            onClick={() => setCalendarMonth(m => addMonths(m, 1))}
            className="p-2 rounded-xl hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] text-[#79747E] dark:text-[#938F99] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <span key={d} className="text-[10px] sm:text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase text-center">{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {calendarDays.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd')
            const inMonth = isSameMonth(day, calendarMonth)
            const selected = filterDate === dayStr
            const dayBookings = bookingsByDate.get(dayStr) || []
            const hasBookings = dayBookings.length > 0
            const earliestTime = hasBookings ? dayBookings[0].booking_time?.slice(0, 5) : null

            return (
              <button
                key={dayStr}
                onClick={() => setFilterDate(dayStr)}
                className={`relative min-h-[50px] sm:min-h-[58px] p-1 rounded-xl text-xs font-semibold flex flex-col items-center justify-between transition-all border ${
                  selected
                    ? 'bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] border-[#6750A4] shadow-md ring-2 ring-[#6750A4]/30'
                    : hasBookings
                      ? 'bg-[#F3EDF7] dark:bg-[#2B2930] border-[#D0BCFF] dark:border-[#4F378B] text-[#1D1A22] dark:text-[#E6E0E9] hover:bg-[#EADDFF]'
                      : inMonth
                        ? isToday(day)
                          ? 'text-[#6750A4] dark:text-[#D0BCFF] bg-[#EADDFF]/50 dark:bg-[#4F378B]/40 border-transparent hover:bg-[#EADDFF]'
                          : 'text-[#49454F] dark:text-[#CAC4D0] border-transparent hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930]'
                        : 'text-[#CAC4D0] dark:text-[#49454F] border-transparent opacity-40 hover:opacity-70'
                }`}
              >
                {/* Day Number */}
                <span className={`text-xs font-bold ${isToday(day) && !selected ? 'text-[#6750A4] dark:text-[#D0BCFF]' : ''}`}>
                  {day.getDate()}
                </span>

                {/* Booking Indicator / Time Chip */}
                {hasBookings && (
                  <div className="w-full flex flex-col items-center gap-0.5 mt-0.5">
                    <span
                      className={`text-[9px] sm:text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md leading-none truncate max-w-full ${
                        selected
                          ? 'bg-white/25 text-white'
                          : 'bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]'
                      }`}
                      title={`${dayBookings.length} booking(s) - starts ${earliestTime}`}>
                      {earliestTime || `${dayBookings.length} booked`}
                    </span>

                    {dayBookings.length > 1 && (
                      <span className={`text-[8px] font-bold leading-none ${selected ? 'text-white/80' : 'text-[#6750A4] dark:text-[#D0BCFF]'}`}>
                        +{dayBookings.length - 1} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#E8DEF8] dark:border-[#382E48]">
          <button
            onClick={() => setFilterDate('')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              !filterDate ? 'bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]' : 'text-[#79747E] dark:text-[#938F99] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9]'
            }`}
          >
            All dates
          </button>
          <span className="text-xs font-medium text-[#79747E] dark:text-[#938F99]">
            {filterDate ? (
              <span className="font-bold text-[#6750A4] dark:text-[#D0BCFF]">
                📅 Showing {formatDate(filterDate)} ({bookings.length} booking{bookings.length !== 1 ? 's' : ''})
              </span>
            ) : (
              `${bookings.length} booking${bookings.length !== 1 ? 's' : ''} total`
            )}
          </span>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              filterStatus === s
                ? 'bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]'
                : 'bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] text-[#49454F] dark:text-[#CAC4D0] hover:border-[#6750A4] dark:hover:border-[#D0BCFF] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Bookings Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-7 h-7 border-2 border-[#6750A4] dark:border-[#D0BCFF] border-t-transparent rounded-full" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
          <div className="w-14 h-14 bg-[#F3EDF7] dark:bg-[#2B2930] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calendar size={24} className="text-[#79747E] dark:text-[#938F99]" />
          </div>
          <p className="font-semibold text-[#49454F] dark:text-[#CAC4D0]">No bookings found</p>
          <p className="text-sm text-[#79747E] dark:text-[#938F99] mt-1">Create a new booking to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bookings.map(b => {
            const sc = statusConfig[b.status]
            return (
              <div key={b.id} className="bg-white dark:bg-[#1D192B] rounded-[24px] border border-[#E8DEF8] dark:border-[#382E48] p-5 hover:shadow-md transition-shadow">
                {/* Top row */}
                <div className="flex items-start justify-between mb-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${sc.bg} ${sc.text} ${sc.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {sc.label}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setViewingBooking(b)} className="p-1.5 rounded-lg text-[#CAC4D0] dark:text-[#49454F] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors">
                      <Eye size={14} />
                    </button>
                    {b.status === 'pending' && (
                      <button onClick={() => updateStatus.mutate({ id: b.id, status: 'confirmed' })}
                        className="p-1.5 rounded-lg text-[#CAC4D0] dark:text-[#49454F] hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Confirm">
                        <Check size={14} />
                      </button>
                    )}
                    {b.status === 'confirmed' && (
                      <button onClick={() => updateStatus.mutate({ id: b.id, status: 'completed' })}
                        className="p-1.5 rounded-lg text-[#CAC4D0] dark:text-[#49454F] hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Complete">
                        <Check size={14} />
                      </button>
                    )}
                    {(b.status === 'pending' || b.status === 'confirmed') && (
                      <button onClick={() => setCancelId(b.id)}
                        className="p-1.5 rounded-lg text-[#CAC4D0] dark:text-[#49454F] hover:text-red-500 hover:bg-red-50 transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Customer */}
                <p className="font-bold text-[#1D1A22] dark:text-[#E6E0E9] text-base capitalize">{toTitleCase(b.customer_name)}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1 mb-4">
                  <span className="flex items-center gap-1 text-xs text-[#79747E] dark:text-[#938F99]">
                    <Phone size={11} />{b.customer_phone}
                  </span>
                  {b.customer_place && (
                    <span className="flex items-center gap-1 text-xs text-[#79747E] dark:text-[#938F99] capitalize">
                      <MapPin size={11} />{toTitleCase(b.customer_place)}
                    </span>
                  )}
                </div>

                {/* Date / Time */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-[#49454F] dark:text-[#CAC4D0]">
                    <Calendar size={13} className="text-[#79747E] dark:text-[#938F99]" />
                    {formatDate(b.booking_date)}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-[#49454F] dark:text-[#CAC4D0]">
                    <Clock size={13} className="text-[#79747E] dark:text-[#938F99]" />
                    {b.booking_time}
                  </div>
                </div>

                {/* Services */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {b.services.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0] text-xs font-medium rounded-full">
                      {s.name}
                    </span>
                  ))}
                </div>

                {/* Staff */}
                {b.staff && (
                  <div className="flex items-center gap-1.5 text-xs text-[#79747E] dark:text-[#938F99] mb-4">
                    <User size={11} />
                    <span className="font-medium text-[#49454F] dark:text-[#CAC4D0]">{b.staff.name}</span>
                  </div>
                )}

                {/* Payment */}
                <div className="flex items-center justify-between pt-4 border-t border-[#E8DEF8] dark:border-[#382E48]">
                  <div className="text-center">
                    <p className="text-xs text-[#79747E] dark:text-[#938F99]">Advance</p>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(b.advance_paid)}</p>
                  </div>
                  <div className="w-px h-8 bg-[#E8DEF8] dark:bg-[#382E48]" />
                  <div className="text-center">
                    <p className="text-xs text-[#79747E] dark:text-[#938F99]">Pending</p>
                    <p className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(b.pending_amount)}</p>
                  </div>
                  <div className="w-px h-8 bg-[#E8DEF8] dark:bg-[#382E48]" />
                  <div className="text-center">
                    <p className="text-xs text-[#79747E] dark:text-[#938F99]">Total</p>
                    <p className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
                      {formatCurrency(b.advance_paid + b.pending_amount)}
                    </p>
                  </div>
                </div>

                {/* Edit & Delete Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-[#E8DEF8] dark:border-[#382E48]">
                  <button
                    type="button"
                    onClick={() => startEditBooking(b)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#6750A4] dark:text-[#D0BCFF] bg-[#F3EDF7] dark:bg-[#2B2930] hover:bg-[#E8DEF8] dark:hover:bg-[#382E48] transition-colors"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingBooking(b)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    title="Delete booking & remove from sales everywhere"
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── BOOKING MODAL (CREATE / EDIT) ─────────────────────────────── */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingBookingId(null) }}
        title={editingBookingId ? 'Edit Booking' : 'New Booking'}
        size="lg"
        footer={
          <>
            <button onClick={() => { setShowModal(false); setEditingBookingId(null) }}
              className="px-4 py-2.5 text-sm font-semibold text-[#49454F] dark:text-[#CAC4D0] border border-[#CAC4D0] dark:border-[#44474F] rounded-xl hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors">
              Cancel
            </button>
            <button form="booking-form" type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-semibold text-white dark:text-[#381E72] bg-[#6750A4] dark:bg-[#D0BCFF] rounded-xl hover:bg-[#7F67BE] dark:hover:bg-[#E8DEF8] disabled:opacity-50 transition-colors flex items-center gap-2">
              {isSubmitting && <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />}
              {editingBookingId ? 'Save Changes' : 'Create Booking'}
            </button>
          </>
        }
      >
        <form id="booking-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* Customer */}
          <div className="space-y-4">
            <p className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">Customer</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name" className="capitalize" autoCapitalize="words" error={errors.customer_name?.message} {...register('customer_name')} />
              <Input label="Contact Number" error={errors.customer_phone?.message} {...register('customer_phone')} />
            </div>
            <Input label="Place / Area" className="capitalize" autoCapitalize="words" {...register('customer_place')} />
          </div>

          <div className="h-px bg-[#E8DEF8] dark:bg-[#382E48]" />

          {/* Schedule */}
          <div className="space-y-4">
            <p className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">Schedule</p>
            <div className="grid grid-cols-1 gap-4">
              <Input label="Date" type="date" error={errors.booking_date?.message} {...register('booking_date')} />
              
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#49454F] dark:text-[#CAC4D0]">Time Selection</label>
                
                {/* Period Toggle */}
                <div className="flex bg-[#F3EDF7] dark:bg-[#2B2930] p-1 rounded-xl w-fit">
                  {(['morning', 'afternoon', 'evening'] as const).map(period => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setTimePeriod(period)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors capitalize ${timePeriod === period ? 'bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] shadow' : 'text-[#49454F] dark:text-[#CAC4D0]'}`}
                    >
                      {period}
                    </button>
                  ))}
                </div>

                {/* Time Chips */}
                <div className="flex flex-wrap gap-2">
                  {(timePeriod === 'morning' ? ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] : 
                    timePeriod === 'afternoon' ? ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'] :
                    ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']).map(time => {
                      const isSelected = watchTime === time
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setValue('booking_time', time, { shouldValidate: true })}
                          className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all ${isSelected ? 'bg-[#6750A4] border-[#6750A4] text-white' : 'bg-transparent border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930]'}`}
                        >
                          {parseInt(time.split(':')[0]) > 12 ? `${parseInt(time.split(':')[0])-12}:${time.split(':')[1]} PM` : parseInt(time.split(':')[0]) === 12 ? `12:${time.split(':')[1]} PM` : `${time} AM`}
                        </button>
                      )
                  })}
                </div>
                {errors.booking_time && <p className="text-xs text-red-500 font-medium">{errors.booking_time.message}</p>}
              </div>
            </div>
          </div>

          <div className="h-px bg-[#E8DEF8] dark:bg-[#382E48]" />

          {/* Services */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">Services</p>

            {fields.length > 0 && (
              <div className="space-y-2">
                {fields.map((field, i) => (
                  <div key={field.id} className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#6750A4] to-[#5a3f9e] dark:from-[#4F378B] dark:to-[#38236b] text-white rounded-2xl gap-3 shadow-2xs border border-white/15">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm" />
                      <span className="text-sm font-semibold truncate">{field.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Luxury Glassmorphism Price Pill */}
                      <div
                        className="flex items-center gap-1.5 bg-black/35 hover:bg-black/45 focus-within:bg-black/55 px-3 py-1.5 rounded-xl border border-white/25 focus-within:border-white/60 focus-within:ring-2 focus-within:ring-white/20 transition-all shadow-inner group/price cursor-text"
                        title="Click to edit service price (special client rate / discount)"
                      >
                        <span className="text-xs font-black text-amber-300 select-none">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          {...register(`services.${i}.price` as const, { valueAsNumber: true })}
                          className="w-16 bg-transparent text-sm font-extrabold text-white outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tracking-tight"
                        />
                        <Pencil size={11} className="text-white/40 group-hover/price:text-white/85 transition-colors shrink-0 ml-0.5" />
                      </div>

                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="w-7 h-7 rounded-xl bg-white/10 hover:bg-red-500/80 text-white/70 hover:text-white flex items-center justify-center transition-all ml-0.5"
                        title="Remove service"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-[#79747E] dark:text-[#938F99] mt-1 flex items-center gap-1">
                  <Pencil size={11} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                  <span>Tap on the price pill above to set a special discounted rate for this client.</span>
                </p>
              </div>
            )}

            {errors.services && <p className="text-xs text-red-500 font-medium">Add at least one service</p>}

            <div className="flex flex-wrap gap-2">
              {services
                .filter(s => s.active && !fields.find(f => f.service_id === s.id))
                .map(svc => (
                  <button key={svc.id} type="button"
                    onClick={() => append({ service_id: svc.id, name: svc.name, price: svc.price })}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] rounded-full text-xs font-medium text-[#49454F] dark:text-[#CAC4D0] hover:border-[#6750A4] dark:hover:border-[#D0BCFF] hover:text-[#6750A4] dark:hover:text-[#D0BCFF] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-all">
                    <Plus size={10} />
                    {svc.name}
                    <span className="text-[#79747E] dark:text-[#938F99]">{formatCurrency(svc.price)}</span>
                  </button>
                ))
              }
            </div>
          </div>

          <div className="h-px bg-[#E8DEF8] dark:bg-[#382E48]" />

          {/* Staff */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">Assign Staff</p>
            <select
              className="w-full rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] px-3.5 py-2.5 text-sm text-[#1D1A22] dark:text-[#E6E0E9] focus:outline-none focus:ring-2 focus:ring-[#6750A4] transition-all"
              {...register('assigned_staff_id')}>
              <option value="">— Unassigned —</option>
              {staffList.filter(s => s.active && s.role === 'staff').map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{(s as typeof s & { speciality?: string }).speciality ? ` · ${(s as typeof s & { speciality?: string }).speciality}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="h-px bg-[#E8DEF8] dark:bg-[#382E48]" />

          {/* Booking Status (Crucial for backdated past sales) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">
                Booking Status
              </p>
              {watchStatus === 'completed' && (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ✨ Reflects immediately in Sales & Accounts
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'pending', label: 'Pending', desc: 'Upcoming' },
                { id: 'confirmed', label: 'Confirmed', desc: 'Slot Fixed' },
                { id: 'completed', label: 'Completed', desc: 'Done & Paid' },
              ].map(st => {
                const isSelected = watchStatus === st.id
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setValue('status', st.id as any, { shouldValidate: true })
                      if (st.id === 'completed' && totalAmount > 0 && watchAdvance === 0) {
                        setValue('advance_paid', totalAmount)
                      }
                    }}
                    className={`px-3 py-2 rounded-xl text-left border transition-all ${
                      isSelected
                        ? st.id === 'completed'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow'
                          : 'bg-[#6750A4] text-white border-[#6750A4] shadow'
                        : 'bg-transparent border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930]'
                    }`}
                  >
                    <p className="text-xs font-bold leading-tight">{st.label}</p>
                    <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-[#79747E] dark:text-[#938F99]'}`}>{st.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="h-px bg-[#E8DEF8] dark:bg-[#382E48]" />

          {/* Payment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">Payment</p>
              {totalAmount > 0 && (watchAdvance < totalAmount || watchAdvance === 0) && (
                <button
                  type="button"
                  onClick={() => setValue('advance_paid', totalAmount)}
                  className="text-xs font-bold text-[#6750A4] dark:text-[#D0BCFF] hover:underline flex items-center gap-1"
                >
                  <span>💰 Paid in Full (₹{totalAmount})</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Paid Amount (₹)" type="number" step="0.01" {...register('advance_paid')} />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">Pending</label>
                <div className="rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-[#F3EDF7] dark:bg-[#2B2930] px-3.5 py-2.5 text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
                  {formatCurrency(pendingAmount)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map(pm => {
                  const isSelected = watchPaymentMethod === pm.id
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setValue('payment_method', pm.id, { shouldValidate: true })}
                      className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-xl border transition-all ${isSelected ? 'bg-[#6750A4] border-[#6750A4] text-white' : 'bg-transparent border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930]'}`}
                    >
                      {pm.icon} {pm.label}
                    </button>
                  )
                })}
              </div>
              {errors.payment_method && <p className="text-xs text-red-500 font-medium">{errors.payment_method.message}</p>}
            </div>

            {totalAmount > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-[#6750A4] dark:bg-[#4F378B] text-white dark:text-[#EADDFF] rounded-xl">
                <span className="text-sm text-white/70 dark:text-[#EADDFF]/70">{fields.length} service{fields.length !== 1 ? 's' : ''}</span>
                <span className="text-lg font-bold">{formatCurrency(totalAmount)}</span>
              </div>
            )}
          </div>

          <div className="h-px bg-[#E8DEF8] dark:bg-[#382E48]" />

          <Input label="Notes (optional)" {...register('notes')} />
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewingBooking} onClose={() => setViewingBooking(null)} title="Booking Details">
        {viewingBooking && (
          <div className="divide-y divide-[#E8DEF8] dark:divide-[#382E48]">
            {([
              ['Customer', viewingBooking.customer_name],
              ['Phone', viewingBooking.customer_phone],
              ['Place', viewingBooking.customer_place ?? '—'],
              ['Date', formatDate(viewingBooking.booking_date)],
              ['Time', viewingBooking.booking_time],
              ['Staff', viewingBooking.staff?.name ?? 'Unassigned'],
              ['Status', statusConfig[viewingBooking.status].label],
              ['Advance Paid', formatCurrency(viewingBooking.advance_paid)],
              ['Pending', formatCurrency(viewingBooking.pending_amount)],
              ['Notes', viewingBooking.notes ?? '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-3">
                <span className="text-xs font-semibold text-[#79747E] dark:text-[#938F99] uppercase tracking-wide">{label}</span>
                <span className="text-sm font-semibold text-[#1D1A22] dark:text-[#E6E0E9]">{value}</span>
              </div>
            ))}
            <div className="pt-3">
              <p className="text-xs font-semibold text-[#79747E] dark:text-[#938F99] uppercase tracking-wide mb-2">Services</p>
              <div className="flex flex-wrap gap-2">
                {viewingBooking.services.map((s, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0] rounded-full text-xs font-semibold">
                    {s.name}
                    <span className="text-[#79747E] dark:text-[#938F99]">{formatCurrency(s.price)}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={() => { updateStatus.mutate({ id: cancelId!, status: 'cancelled' }); setCancelId(null) }}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking? This cannot be undone."
        confirmLabel="Cancel Booking"
      />

      <ConfirmModal
        open={!!deletingBooking}
        onClose={() => setDeletingBooking(null)}
        onConfirm={() => {
          if (deletingBooking) deleteBooking.mutate(deletingBooking)
        }}
        title="Delete Booking & Associated Sale"
        message={`Are you sure you want to permanently delete the booking for "${deletingBooking?.customer_name}"? This will completely remove it from Bookings, Sales, Work Records, and Financial reports.`}
        confirmLabel="Delete Everywhere"
        loading={deleteBooking.isPending}
      />
    </div>
  )
}
