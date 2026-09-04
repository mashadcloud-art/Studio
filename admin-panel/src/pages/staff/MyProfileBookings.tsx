import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar, Clock3, MapPin, Sparkles, Check, ChevronRight, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useServices } from '../../hooks/useServices'
import { useAvailableBookings, type OpenBooking } from '../../hooks/useAvailableBookings'
import { supabase } from '../../lib/supabase'
import { BookingCard, type Booking } from '../../components/staff/BookingCard'
import { ProfileSectionHeader } from '../../components/staff/ProfileSectionHeader'
import { formatCurrency, toTitleCase } from '../../lib/utils'
import { useQuery } from '@tanstack/react-query'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function MyProfileBookings() {
  const { staff } = useAuth()
  const { data: allServices = [] } = useServices()
  const activeServices = allServices.filter(s => s.active).map(s => ({ id: s.id, name: s.name, price: s.price }))

  const [tab, setTab] = useState<'my' | 'open'>('my')
  const [showCompleted, setShowCompleted] = useState(false)

  // Available / unassigned bookings hook
  const { availableBookings, availableCount, claimBooking, releaseBooking } = useAvailableBookings()

  // My assigned bookings
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: myBookings = [], isLoading: loadingMy } = useQuery<Booking[]>({
    queryKey: ['my_assigned_bookings', staff?.id, today],
    queryFn: async () => {
      if (!staff?.id) return []
      const { data, error } = await db.from('bookings').select('*')
        .eq('assigned_staff_id', staff.id)
        .neq('status', 'cancelled')
        .gte('booking_date', today)
        .order('booking_date', { ascending: true })
        .order('booking_time', { ascending: true })
      if (error) throw error
      return data as Booking[]
    },
    enabled: !!staff?.id,
    refetchInterval: 3000,
  })

  // Separate active upcoming jobs from completed jobs
  const activeBookings = myBookings.filter(b => b.status === 'pending' || b.status === 'confirmed')
  const completedBookings = myBookings.filter(b => b.status === 'completed')

  const handleStatusChange = () => {
    // Queries auto-refetched via react-query
  }

  const handleRelease = (id: string) => {
    releaseBooking.mutate(id)
  }

  const handleClaim = (b: OpenBooking) => {
    if (!staff?.id) return
    claimBooking.mutate({ bookingId: b.id, staffId: staff.id })
  }

  if (!staff) return null

  return (
    <div className="space-y-4">
      <ProfileSectionHeader
        title="Bookings & Appointments"
        subtitle="Manage your assigned jobs or claim open client bookings"
      />

      {/* Segmented Tab Switcher */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] max-w-md">
        <button
          onClick={() => setTab('my')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
            tab === 'my'
              ? 'bg-[#6750A4] text-white shadow-sm dark:bg-[#D0BCFF] dark:text-[#381E72]'
              : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <span>My Active Jobs</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            tab === 'my'
              ? 'bg-white/25 text-white dark:bg-[#381E72]/20 dark:text-[#381E72]'
              : 'bg-black/10 dark:bg-white/10 text-[#49454F] dark:text-[#CAC4D0]'
          }`}>
            {activeBookings.length}
          </span>
        </button>

        <button
          onClick={() => setTab('open')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all relative ${
            tab === 'open'
              ? 'bg-[#6750A4] text-white shadow-sm dark:bg-[#D0BCFF] dark:text-[#381E72]'
              : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Sparkles size={13} className={availableCount > 0 ? 'text-amber-300 animate-pulse' : ''} />
          <span>Open to Claim</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            availableCount > 0
              ? 'bg-amber-500 text-white animate-bounce shadow-sm'
              : tab === 'open'
                ? 'bg-white/25 text-white dark:bg-[#381E72]/20 dark:text-[#381E72]'
                : 'bg-black/10 dark:bg-white/10 text-[#49454F] dark:text-[#CAC4D0]'
          }`}>
            {availableCount}
          </span>
        </button>
      </div>

      {/* TAB CONTENT: MY ACTIVE ASSIGNED BOOKINGS */}
      {tab === 'my' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          {loadingMy ? (
            <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ textAlign: 'center', padding: '32px 0', fontSize: 13 }}>
              Loading your bookings…
            </div>
          ) : activeBookings.length > 0 ? (
            activeBookings.map(b => (
              <BookingCard
                key={b.id}
                booking={b}
                staffId={staff.id}
                services={activeServices}
                onStatusChange={handleStatusChange}
                onRelease={handleRelease}
              />
            ))
          ) : (
            <div
              className="rounded-2xl bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] text-[#938F99] dark:text-[#CAC4D0] p-8 text-center"
            >
              <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-semibold text-[#1D1A22] dark:text-[#E6E0E9]">All active bookings completed!</p>
              <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-1">You have no upcoming pending jobs right now.</p>
              {availableCount > 0 && (
                <button
                  onClick={() => setTab('open')}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#6750A4] text-white text-xs font-bold hover:opacity-90 shadow-sm transition-opacity"
                >
                  <Sparkles size={13} />
                  <span>Check {availableCount} Open Jobs to Claim</span>
                  <ChevronRight size={13} />
                </button>
              )}
            </div>
          )}

          {/* Collapsible Completed Today list */}
          {completedBookings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#E8DEF8] dark:border-[#382E48]">
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className="text-xs font-bold text-[#6750A4] dark:text-[#D0BCFF] flex items-center gap-1.5 hover:underline mb-3 cursor-pointer"
              >
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>{showCompleted ? 'Hide' : 'Show'} Completed Today ({completedBookings.length})</span>
              </button>

              {showCompleted && (
                <div className="space-y-2.5 opacity-90">
                  {completedBookings.map(b => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      staffId={staff.id}
                      services={activeServices}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: OPEN / UNASSIGNED BOOKINGS */}
      {tab === 'open' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          {availableBookings.length > 0 ? (
            availableBookings.map(b => {
              const serviceNames = b.services?.map(s => s.name).join(', ') || 'General Service'
              const totalAmount = b.services?.reduce((sum, s) => sum + s.price, 0) || 0
              let dateLabel = b.booking_date
              try { dateLabel = format(parseISO(b.booking_date), 'EEE, d MMM') } catch { /* keep raw */ }
              const timeLabel = b.booking_time?.slice(0, 5) ?? b.booking_time

              const isClaiming = claimBooking.isPending && claimBooking.variables?.bookingId === b.id

              return (
                <div
                  key={b.id}
                  className="rounded-2xl p-4 bg-white dark:bg-[#1D192B] border-2 border-dashed border-amber-300 dark:border-amber-600/40 shadow-xs flex flex-col gap-3 transition-all hover:border-amber-400"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
                          {toTitleCase(b.customer_name)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
                          OPEN JOB
                        </span>
                      </div>
                      <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-0.5 font-medium">
                        {serviceNames}
                      </p>
                    </div>
                    <div className="text-base font-extrabold text-[#1D1A22] dark:text-[#E6E0E9]">
                      {formatCurrency(totalAmount)}
                    </div>
                  </div>

                  {/* Booking Details */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#49454F] dark:text-[#CAC4D0]">
                    <span className="flex items-center gap-1">
                      <Calendar size={13} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                      {dateLabel}
                    </span>
                    <span className="flex items-center gap-1 font-bold text-[#6750A4] dark:text-[#D0BCFF]">
                      <Clock3 size={13} />
                      {timeLabel}
                    </span>
                    {b.customer_place && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} />
                        {toTitleCase(b.customer_place)}
                      </span>
                    )}
                  </div>

                  {/* Accept Job Action Button */}
                  <button
                    onClick={() => handleClaim(b)}
                    disabled={isClaiming}
                    className="w-full mt-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-[#6750A4] hover:opacity-95 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    {isClaiming ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Accept Booking (Assign to Me)</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })
          ) : (
            <div className="rounded-2xl bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] text-[#938F99] dark:text-[#CAC4D0] p-8 text-center">
              <Check size={28} className="mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-semibold">No open unassigned bookings right now.</p>
              <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-1">
                When a new booking is created without a designated technician, it will appear here for you to accept.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
