import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Phone, Sparkles, Search, CalendarCheck, User, TrendingUp, NotebookPen, ChevronRight, Camera
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffMonthlyReport } from '../../hooks/useReports'
import { useServices } from '../../hooks/useServices'
import { useStaffNotes } from '../../hooks/useStaffNotes'
import { useAvailableBookings } from '../../hooks/useAvailableBookings'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import { cn } from '../../lib/utils'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function MyProfile() {
  const { staff } = useAuth()
  const navigate = useNavigate()
  const now = new Date()
  const { data: report } = useStaffMonthlyReport(staff?.id ?? '', now.getFullYear(), now.getMonth() + 1)
  const { data: allServices = [] } = useServices()
  const { data: notes = [] } = useStaffNotes(staff?.id)

  const [expertSearch, setExpertSearch] = useState('')
  const [showExpertPicker, setShowExpertPicker] = useState(false)
  const [savingExpert, setSavingExpert] = useState(false)
  const { availableCount } = useAvailableBookings()

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const { data: bookingsCount = 0 } = useQuery({
    queryKey: ['staff_upcoming_bookings_count', staff?.id, todayStr],
    queryFn: async () => {
      if (!staff?.id) return 0
      const { count, error } = await db
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_staff_id', staff.id)
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .gte('booking_date', todayStr)
      if (error) return 0
      return count ?? 0
    },
    enabled: !!staff?.id,
    refetchInterval: 3000,
  })

  const today = format(now, 'yyyy-MM-dd')
  const { data: isOnline = false } = useQuery({
    queryKey: ['staff_online_status', staff?.id, today],
    queryFn: async () => {
      if (!staff?.id) return false
      const { data, error } = await db
        .from('attendance')
        .select('id')
        .eq('staff_id', staff.id)
        .eq('date', today)
        .not('check_in', 'is', null)
        .is('check_out', null)
        .maybeSingle()
      
      if (error && error.code !== 'PGRST116') throw error
      return !!data
    },
    enabled: !!staff?.id,
    refetchInterval: 30000 // Poll every 30 seconds
  })

  const { data: myPhotosCount = 0 } = useQuery({
    queryKey: ['staff_gallery_count', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return 0
      const { count, error } = await db
        .from('gallery')
        .select('*', { count: 'exact', head: true })
        .eq('staff_id', staff.id)
      if (error) {
        const local = localStorage.getItem('nailuxe_local_gallery')
        if (local) {
          const items = JSON.parse(local)
          return items.filter((i: any) => i.staff_id === staff.id).length
        }
        return 0
      }
      return count ?? 0
    },
    enabled: !!staff?.id,
  })

  if (!staff) return null

  const totalRevenue = report?.totalRevenue ?? 0
  const roleLabel = staff.role === 'admin' ? 'Studio Administrator' : staff.role === 'receptionist' ? 'Receptionist' : 'Salon Staff'
  const joinYear = new Date(staff.joining_date).getFullYear()
  const speciality = (staff as typeof staff & { speciality?: string }).speciality

  const filteredExpertServices = allServices
    .filter(s => s.active && s.name.toLowerCase().includes(expertSearch.toLowerCase()))
    .slice(0, 20)

  const saveExpertIn = async (serviceName: string) => {
    setSavingExpert(true)
    try {
      await db.from('staff').update({ speciality: serviceName }).eq('id', staff.id)
      toast.success(`Expert in: ${serviceName}`)
      setShowExpertPicker(false)
      setExpertSearch('')
    } catch (e: unknown) { toast.error((e as Error).message) }
    setSavingExpert(false)
  }

  const lastNote = notes[notes.length - 1]
  const notesSubtitle = !lastNote
    ? 'No messages yet'
    : lastNote.voice_url && !lastNote.message
      ? '🎤 Voice message'
      : (lastNote.message ?? '').length > 42
        ? `${lastNote.message!.slice(0, 42)}…`
        : lastNote.message

  const blocks: { key: string; label: string; subtitle: string; icon: ReactNode; accent: string; accentDark: string; bg: string; bgDark: string; path: string }[] = [
    {
      key: 'bookings', label: 'Upcoming Bookings',
      subtitle: availableCount > 0
        ? `${bookingsCount ?? 0} assigned · ⚡ ${availableCount} open`
        : bookingsCount === null ? 'Loading…' : bookingsCount === 0 ? 'No upcoming jobs' : `${bookingsCount} upcoming`,
      icon: <CalendarCheck size={19} />, accent: '#31111D', accentDark: '#FFB3C7', bg: '#FFD8E4', bgDark: '#58102B',
      path: '/my-profile/bookings',
    },
    {
      key: 'contact', label: 'Contact Details',
      subtitle: staff.phone,
      icon: <User size={19} />, accent: '#001D35', accentDark: '#9CB4CC', bg: '#C2E7FF', bgDark: '#003355',
      path: '/my-profile/contact',
    },
    {
      key: 'performance', label: 'Performance',
      subtitle: `${formatCurrency(totalRevenue)} this month`,
      icon: <TrendingUp size={19} />, accent: '#146C2E', accentDark: '#79DF84', bg: '#C4EED0', bgDark: '#003913',
      path: '/my-profile/performance',
    },
    {
      key: 'notes', label: 'Notes',
      subtitle: notesSubtitle ?? 'No messages yet',
      icon: <NotebookPen size={19} />, accent: '#21005D', accentDark: '#EADDFF', bg: '#EADDFF', bgDark: '#4F378B',
      path: '/my-profile/notes',
    },
    {
      key: 'gallery', label: 'Work Gallery',
      subtitle: `${myPhotosCount} set${myPhotosCount !== 1 ? 's' : ''} in portfolio`,
      icon: <Camera size={19} />, accent: '#6750A4', accentDark: '#D0BCFF', bg: '#EADDFF', bgDark: '#4F378B',
      path: '/gallery',
    },
  ]

  const expertPicker = (widthClass: string) => (
    <div className={cn('absolute top-[calc(100%+8px)] left-0 z-50 bg-white dark:bg-[#2B2930] rounded-2xl border border-[#E8DEF8] dark:border-[#44474F] shadow-2xl p-3', widthClass)}>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#938F99]" />
        <input
          type="text"
          placeholder="Search services..."
          value={expertSearch}
          onChange={e => setExpertSearch(e.target.value)}
          autoFocus
          className="w-full py-2 pl-8 pr-3 rounded-lg border border-[#E8DEF8] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[13px] text-[#1D1A22] dark:text-[#E6E0E9] outline-none focus:ring-2 focus:ring-[#6750A4]"
        />
      </div>
      <div className="max-h-[220px] overflow-y-auto flex flex-col gap-0.5">
        {filteredExpertServices.map(svc => (
          <button
            key={svc.id}
            onClick={() => saveExpertIn(svc.name)}
            disabled={savingExpert}
            className={cn(
              'px-3 py-2 rounded-lg text-left text-[13px] font-medium transition-colors',
              speciality === svc.name
                ? 'bg-[#6750A4] text-white'
                : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#F3EDF7] dark:hover:bg-[#382E48]'
            )}
          >
            {svc.name}
            <span className={cn('ml-1.5 text-[11px]', speciality === svc.name ? 'text-white/60' : 'text-[#938F99]')}>
              {formatCurrency(svc.price)}
            </span>
          </button>
        ))}
        {filteredExpertServices.length === 0 && (
          <div className="py-3 text-center text-[13px] text-[#938F99]">No services found</div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* ───────── MOBILE — immersive hero header (Layout suppresses its own topbar for /my-profile) ───────── */}
      <div className="lg:hidden">
        <div className="relative w-full h-[300px] sm:h-[340px] bg-[#1D192B] overflow-hidden">
          <div className="absolute inset-0">
            {staff.avatar_url ? (
              <img src={staff.avatar_url} alt={staff.name} className="w-full h-full object-cover object-top opacity-80" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#4F378B] to-[#6750A4] flex items-center justify-center text-white/30 text-8xl font-black">
                {staff.name.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#FEF7FF] dark:from-[#141218] via-black/35 to-black/55" />
          </div>

          <div className="relative z-10 h-full flex flex-col justify-end px-5 pb-6 pt-16">
            <div className="flex items-center justify-between mb-3">
              <span className="px-3.5 py-1 bg-white/20 backdrop-blur-md text-white text-[11px] font-bold rounded-full flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full', isOnline ? 'bg-[#79DF84] animate-pulse' : 'bg-white/50')} />
                {isOnline ? 'ONLINE (CHECKED IN)' : 'OFFLINE'}
              </span>
              <span className="text-xs font-mono text-white/90 bg-black/40 backdrop-blur-md px-3.5 py-1 rounded-full flex items-center gap-1.5">
                <Phone size={11} /> {staff.phone}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-none uppercase">
              {staff.name}
            </h1>
            <p className="text-xs font-medium text-white/80 mt-1.5">{roleLabel} · Active since {joinYear}</p>
          </div>
        </div>

        <div className="px-5 py-6 space-y-5">
          {/* Expertise card — tap to set/change speciality */}
          <div className="relative">
            <button
              onClick={() => setShowExpertPicker(!showExpertPicker)}
              className="w-full bg-[#F3EDF7] dark:bg-[#2B2930] p-4 rounded-2xl border border-[#E6E0E9] dark:border-[#44474F] shadow-2xs flex items-center gap-3 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] flex items-center justify-center shrink-0">
                <Sparkles size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Expertise</h4>
                <p className="text-[11px] text-[#49454F] dark:text-[#CAC4D0] truncate">
                  {speciality ? `Expert in ${speciality}` : 'Tap to set your speciality'}
                </p>
              </div>
              <ChevronRight size={16} className="text-[#CAC4D0] dark:text-[#938F99] shrink-0" />
            </button>
            {showExpertPicker && expertPicker('w-full')}
          </div>

          {/* Work Gallery Showcase Card */}
          <button
            onClick={() => navigate('/gallery')}
            className="w-full bg-gradient-to-r from-[#6750A4]/15 via-[#9C4146]/10 to-transparent p-4 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] shadow-2xs flex items-center gap-3 text-left hover:border-[#6750A4] transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#6750A4] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Camera size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-1.5">
                <span>My Work Gallery</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-[#6750A4] text-white">
                  {myPhotosCount > 0 ? `${myPhotosCount} SETS` : 'SNAP'}
                </span>
              </h4>
              <p className="text-[11px] text-[#49454F] dark:text-[#CAC4D0] truncate">
                {myPhotosCount > 0
                  ? `${myPhotosCount} client nail set${myPhotosCount !== 1 ? 's' : ''} in your portfolio`
                  : 'Snap client photos while doing jobs to build portfolio'}
              </p>
            </div>
            <ChevronRight size={16} className="text-[#6750A4] dark:text-[#D0BCFF] shrink-0" />
          </button>

          {/* Open Bookings Alert Banner */}
          {availableCount > 0 && (
            <div
              onClick={() => navigate('/my-profile/bookings')}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#6750A4]/15 to-transparent border border-amber-300 dark:border-amber-600/40 flex items-center justify-between gap-3 cursor-pointer hover:border-amber-400 transition-all shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs animate-bounce">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-1.5">
                    <span>{availableCount} Open Booking{availableCount > 1 ? 's' : ''} Waiting!</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-500 text-white">NEW</span>
                  </h4>
                  <p className="text-[11px] text-[#49454F] dark:text-[#CAC4D0]">Tap to claim and assign to yourself</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#6750A4] dark:text-[#D0BCFF] shrink-0" />
            </div>
          )}

          {/* Quick Access */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6750A4] dark:text-[#D0BCFF] px-1">Quick Access</h3>
            <div className="grid grid-cols-2 gap-3">
              {blocks.map(b => (
                <button
                  key={b.key}
                  onClick={() => navigate(b.path)}
                  className="bg-[#F3EDF7] dark:bg-[#2B2930] p-4 rounded-2xl border border-[#E6E0E9] dark:border-[#44474F] shadow-2xs flex flex-col justify-between gap-4 text-left active:scale-[0.98] transition-transform"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: b.bg, color: b.accent }}
                  >
                    {b.icon}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{b.label}</h4>
                    <p className="text-[10px] text-[#49454F] dark:text-[#CAC4D0] truncate mt-0.5">{b.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ───────── DESKTOP — existing split panel layout, unchanged ───────── */}
      <div className="hidden lg:block space-y-6">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-tight">My Profile</h1>
          <p className="text-[13px] text-[#79747E] dark:text-[#938F99] mt-[3px]">Your account, bookings and performance</p>
        </div>

        {/* Profile panel */}
        <div className="flex flex-row h-[calc(100vh-170px)] overflow-hidden bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] rounded-[28px]">

          {/* LEFT — Content */}
          <div className="order-1" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, padding: 28, minWidth: 0 }}>
            {/* Top info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className="text-[11px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] uppercase tracking-[0.12em]">Nailuxe Studio</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-[#79747E] dark:text-[#938F99] text-[13px]">
                  <Phone size={13} />{staff.phone}
                </div>
              </div>
            </div>

            {/* Name */}
            <div>
              <h2 className="text-[32px] font-black text-[#1D1A22] dark:text-[#E6E0E9] leading-[0.95] tracking-[-1px] uppercase">
                {staff.name}
              </h2>
              <p className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-[0.15em] mt-2">
                {roleLabel} · Active since {joinYear}
              </p>

              {/* Expert In */}
              <div className="mt-3 relative inline-block">
                <button
                  onClick={() => setShowExpertPicker(!showExpertPicker)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#6750A4] dark:border-[#D0BCFF] font-sans',
                    speciality ? 'bg-[#6750A4] dark:bg-[#D0BCFF]' : 'bg-white dark:bg-transparent'
                  )}
                >
                  <Sparkles size={12} className={speciality ? 'text-white dark:text-[#381E72]' : 'text-[#6750A4] dark:text-[#D0BCFF]'} />
                  <span className={cn('text-xs font-bold', speciality ? 'text-white dark:text-[#381E72]' : 'text-[#6750A4] dark:text-[#D0BCFF]')}>
                    {speciality ? `Expert in ${speciality}` : 'Set Speciality'}
                  </span>
                </button>
                {showExpertPicker && expertPicker('w-[320px]')}
              </div>
            </div>

            {/* Quick access blocks */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
              <p className="text-[10px] font-extrabold text-[#938F99] uppercase tracking-[0.12em]">Quick Access</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                {blocks.map(b => (
                  <button
                    key={b.key}
                    onClick={() => navigate(b.path)}
                    className="aspect-square flex flex-col items-center justify-center gap-3 p-4 rounded-[24px] border border-[#E8DEF8] dark:border-[#382E48] bg-white dark:bg-[#2B2930] text-center transition-all hover:border-[#CAC4D0] dark:hover:border-[#938F99] hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mb-1"
                      style={{ background: b.bg, color: b.accent }}
                    >
                      {b.icon}
                    </div>
                    <div className="w-full min-w-0">
                      <div className="text-[13px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9]">{b.label}</div>
                      <div className="text-[11px] text-[#938F99] dark:text-[#CAC4D0] mt-1 overflow-hidden text-ellipsis whitespace-nowrap px-1">{b.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — Full length photo */}
          <div className="order-2 relative overflow-hidden shrink-0 bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ width: '38%' }}>
            {staff.avatar_url ? (
              <img
                src={staff.avatar_url}
                alt={staff.name}
                className="w-full h-full object-cover object-top"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[80px] font-black text-[#CAC4D0] dark:text-[#49454F]">
                {staff.name.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(56,30,114,0.18) 0%, transparent 40%)' }} />
            <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/92 dark:bg-[#1D192B]/92 backdrop-blur-md shadow-lg">
              <span className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-green-500 animate-pulse' : 'bg-[#938F99]')} />
              <span className="text-[10px] font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] uppercase tracking-[0.08em]">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
