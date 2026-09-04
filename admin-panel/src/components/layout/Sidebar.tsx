import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, UserCircle, Scissors, ClipboardList,
  BarChart3, Settings, LogOut, Clock, CalendarCheck, Receipt,
  TrendingUp, Wallet, UserCheck, Banknote, MapPin, Menu, Sun, Moon,
  MessageCircle, Bell, FileText, ChevronDown, ChevronRight, Camera
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { cn } from '../../lib/utils'
import toast from 'react-hot-toast'

export type NavEntry =
  | { type: 'link'; to: string; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }
  | {
      type: 'group'
      id: string
      label: string
      icon: React.ComponentType<{ size?: number; className?: string }>
      items: { to: string; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }[]
    }

export const adminNavEntries: NavEntry[] = [
  { type: 'link', to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { type: 'link', to: '/bookings', icon: CalendarCheck, label: 'Bookings' },
  { type: 'link', to: '/gallery', icon: Camera, label: 'Work Gallery' },
  { type: 'link', to: '/sales', icon: Receipt, label: 'Sales & Invoices' },
  { type: 'link', to: '/work-records', icon: ClipboardList, label: 'Work Records' },
  {
    type: 'group',
    id: 'accounts',
    label: 'Accounts',
    icon: Wallet,
    items: [
      { to: '/finance', icon: TrendingUp, label: 'Finance & P&L' },
      { to: '/payments', icon: Banknote, label: 'Collect Payments' },
      { to: '/expenses', icon: FileText, label: 'Expenses' },
    ],
  },
  {
    type: 'group',
    id: 'attendance',
    label: 'Attendance & HR',
    icon: UserCheck,
    items: [
      { to: '/attendance', icon: UserCheck, label: 'Attendance' },
      { to: '/payroll', icon: Banknote, label: 'Payroll' },
      { to: '/overtime', icon: Clock, label: 'Overtime' },
      { to: '/reports', icon: BarChart3, label: 'Reports' },
    ],
  },
  {
    type: 'group',
    id: 'management',
    label: 'Studio Manage',
    icon: Users,
    items: [
      { to: '/staff', icon: Users, label: 'Team Staff' },
      { to: '/customers', icon: UserCircle, label: 'Customers' },
      { to: '/services', icon: Scissors, label: 'Services' },
      { to: '/gallery', icon: Camera, label: 'Work Gallery' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

const receptionistNavEntries: NavEntry[] = [
  { type: 'link', to: '/sales', icon: Receipt, label: 'Sales & Invoices' },
  { type: 'link', to: '/bookings', icon: CalendarCheck, label: 'Bookings' },
  {
    type: 'group',
    id: 'accounts',
    label: 'Accounts',
    icon: Wallet,
    items: [
      { to: '/payments', icon: Banknote, label: 'Collect Payment' },
      { to: '/expenses', icon: FileText, label: 'Expenses' },
    ],
  },
  { type: 'link', to: '/gallery', icon: Camera, label: 'Work Gallery' },
  { type: 'link', to: '/my-profile', icon: UserCircle, label: 'My Profile' },
]

const staffNavEntries: NavEntry[] = [
  { type: 'link', to: '/checkin', icon: MapPin, label: 'Check In/Out' },
  { type: 'link', to: '/gallery', icon: Camera, label: 'Work Gallery' },
  { type: 'link', to: '/my-work', icon: BarChart3, label: 'My Work' },
  { type: 'link', to: '/my-profile', icon: UserCircle, label: 'My Profile' },
]

// Small subset shown on the mobile floating bottom nav — kept to 3-4 items per role.
export const bottomNavItems: Record<string, { to: string; icon: typeof LayoutDashboard; label: string }[]> = {
  admin: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    { to: '/bookings', icon: CalendarCheck, label: 'Bookings' },
    { to: '/gallery', icon: Camera, label: 'Gallery' },
    { to: '/sales', icon: Receipt, label: 'Sales' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ],
  receptionist: [
    { to: '/bookings', icon: CalendarCheck, label: 'Bookings' },
    { to: '/payments', icon: Wallet, label: 'Payments' },
    { to: '/gallery', icon: Camera, label: 'Gallery' },
    { to: '/my-profile', icon: UserCircle, label: 'Profile' },
  ],
  staff: [
    { to: '/my-profile', icon: UserCircle, label: 'Profile' },
    { to: '/checkin', icon: MapPin, label: 'Check-In' },
    { to: '/gallery', icon: Camera, label: 'Gallery' },
    { to: '/my-work', icon: BarChart3, label: 'My Work' },
  ],
}

/** Hook to fetch active notification badges for sidebar */
export function useSidebarNotifications() {
  // Pending payments awaiting collection
  const { data: pendingPayments = 0 } = useQuery({
    queryKey: ['sidebar_pending_payments'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'cancelled')
        .eq('payment_status', 'unpaid')
        .gt('pending_amount', 0)
      if (error) {
        console.error('sidebar pending payments error:', error)
        return 0
      }
      return count ?? 0
    },
    refetchInterval: 10000,
  })

  // Pending bookings awaiting confirmation
  const { data: pendingBookings = 0 } = useQuery({
    queryKey: ['sidebar_pending_bookings'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) {
        console.error('sidebar pending bookings error:', error)
        return 0
      }
      return count ?? 0
    },
    refetchInterval: 10000,
  })

  return { pendingPayments, pendingBookings }
}

function useRoleNavEntries() {
  const { staff, isAdmin, isImpersonating } = useAuth()
  const effectiveAdmin = isAdmin && !isImpersonating
  const roleKey = effectiveAdmin ? 'admin' : staff?.role === 'receptionist' ? 'receptionist' : 'staff'
  const navEntries = effectiveAdmin
    ? adminNavEntries
    : staff?.role === 'receptionist'
      ? receptionistNavEntries
      : staffNavEntries
  const canReviewOvertime = effectiveAdmin || staff?.role === 'receptionist'
  return { navEntries, roleKey, staff, isAdmin: effectiveAdmin, canReviewOvertime }
}

/** Desktop: collapsible icon rail with live notifications (e.g. green light for payments) */
export function IconSidebar({
  onToggleChat,
  hasUnread,
  unreadChatCount,
  onOpenApprovals,
  pendingApprovals,
}: {
  onToggleChat?: () => void
  hasUnread?: boolean
  unreadChatCount?: number
  onOpenApprovals?: () => void
  pendingApprovals?: number
}) {
  const { navEntries, canReviewOvertime } = useRoleNavEntries()
  const { pendingPayments, pendingBookings } = useSidebarNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const isDark = theme === 'dark'

  // Open groups state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    accounts: true,
    attendance: true,
    management: false,
  })

  // Auto-expand group if current route matches one of its items
  useEffect(() => {
    navEntries.forEach(entry => {
      if (entry.type === 'group') {
        const hasActive = entry.items.some(item => location.pathname.startsWith(item.to))
        if (hasActive) {
          setOpenGroups(prev => ({ ...prev, [entry.id]: true }))
        }
      }
    })
  }, [location.pathname, navEntries])

  const toggleGroup = (id: string) => {
    if (!expanded) setExpanded(true)
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  const rowClass = (active?: boolean) =>
    cn(
      'relative flex items-center gap-3.5 w-full p-3 rounded-2xl transition-all shrink-0 cursor-pointer',
      active
        ? 'bg-[#EADDFF] text-[#21005D] dark:bg-[#4F378B] dark:text-[#EADDFF] shadow-2xs font-semibold'
        : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#E8DEF8] dark:hover:bg-[#2B2930]'
    )

  const subRowClass = (active?: boolean) =>
    cn(
      'flex items-center gap-2.5 w-full py-2 px-3 rounded-xl transition-all shrink-0 text-xs cursor-pointer',
      active
        ? 'bg-[#6750A4] text-white dark:bg-[#D0BCFF] dark:text-[#381E72] font-bold shadow-xs'
        : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#EADDFF]/40 dark:hover:bg-[#382E48]'
    )

  const labelClass = cn(
    'text-xs font-medium whitespace-nowrap overflow-hidden transition-all duration-300',
    expanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
  )

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col justify-between py-4 bg-[#F3EDF7] dark:bg-[#1D192B] border-r border-[#E6E0E9] dark:border-[#2B2930] z-40 shrink-0 transition-all duration-300 ease-in-out shadow-sm',
        expanded ? 'w-64' : 'w-20'
      )}
    >
      {/* Top: expand/collapse toggle + grouped navigation */}
      <div className="flex flex-col gap-4 px-3 w-full overflow-hidden">
        {/* Toggle & Brand */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse sidebar' : 'Click to expand page & view all categories'}
            className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6750A4] to-[#D0BCFF] text-white dark:text-[#381E72] flex items-center justify-center shadow-sm hover:opacity-90 transition active:scale-95 shrink-0"
          >
            <Menu size={22} />
          </button>
          {expanded && (
            <div className="flex flex-col overflow-hidden pr-2">
              <span className="text-sm font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-tight">Nailuxe</span>
              <span className="text-[10px] text-[#79747E] dark:text-[#938F99]">Studio Manager</span>
            </div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex flex-col gap-1 w-full overflow-y-auto max-h-[calc(100vh-250px)] pr-1 custom-scrollbar">
          {navEntries.map(entry => {
            if (entry.type === 'link') {
              const Icon = entry.icon
              const isBookings = entry.to === '/bookings'
              const showBookingBadge = isBookings && pendingBookings > 0

              return (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  title={entry.label}
                  className={({ isActive }) => rowClass(isActive)}
                >
                  <Icon size={19} className="shrink-0" />
                  <span className={labelClass}>{entry.label}</span>

                  {/* Bookings Notification badge */}
                  {showBookingBadge && (
                    <>
                      {!expanded ? (
                        <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-amber-500 text-white rounded-full text-[9px] font-black flex items-center justify-center border border-white dark:border-[#1D192B] shadow-xs animate-pulse">
                          {pendingBookings}
                        </span>
                      ) : (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {pendingBookings} pending
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              )
            }

            // Category Group (Accounts, Attendance & HR, Management)
            const Icon = entry.icon
            const isOpen = openGroups[entry.id] ?? false
            const isAnyChildActive = entry.items.some(item => location.pathname.startsWith(item.to))
            const isAccounts = entry.id === 'accounts'
            const showAccountsGreenLight = isAccounts && pendingPayments > 0

            return (
              <div key={entry.id} className="flex flex-col w-full my-0.5">
                {/* Category Header Button */}
                <button
                  onClick={() => toggleGroup(entry.id)}
                  title={`${entry.label} (Click to expand)`}
                  className={cn(
                    'relative flex items-center justify-between w-full p-2.5 rounded-2xl transition-all text-left group',
                    isAnyChildActive
                      ? 'bg-[#EADDFF]/70 text-[#21005D] dark:bg-[#4F378B]/50 dark:text-[#EADDFF] font-bold'
                      : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#E8DEF8] dark:hover:bg-[#2B2930]'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={19} className={cn('shrink-0', isAnyChildActive ? 'text-[#6750A4] dark:text-[#D0BCFF]' : '')} />
                    <span className={cn(labelClass, 'font-bold uppercase tracking-wider text-[11px]')}>
                      {entry.label}
                    </span>
                  </div>

                  {/* Green light / notification badge for Accounts in rail mode */}
                  {showAccountsGreenLight && !expanded && (
                    <span
                      title={`${pendingPayments} payment(s) awaiting collection`}
                      className="absolute top-1 right-1.5 min-w-[18px] h-[18px] px-1 bg-emerald-500 text-white rounded-full text-[9px] font-black flex items-center justify-center border-2 border-[#F3EDF7] dark:border-[#1D192B] shadow-[0_0_10px_rgba(16,185,129,0.9)] animate-pulse"
                    >
                      {pendingPayments}
                    </span>
                  )}

                  {/* Expanded badge & chevron */}
                  {expanded && (
                    <div className="flex items-center gap-1.5">
                      {showAccountsGreenLight && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          <span>{pendingPayments} collect</span>
                        </span>
                      )}
                      <span className="text-[#79747E] dark:text-[#938F99] group-hover:text-[#1D1A22] dark:group-hover:text-[#E6E0E9] transition-transform">
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </span>
                    </div>
                  )}
                </button>

                {/* Sub-items (Expandable) */}
                {isOpen && expanded && (
                  <div className="flex flex-col gap-1 pl-4 mt-1 border-l-2 border-[#D0BCFF]/60 dark:border-[#4F378B]/60 ml-4 py-1 animate-fadeIn">
                    {entry.items.map(subItem => {
                      const SubIcon = subItem.icon
                      const isPaymentSubItem = subItem.to === '/payments'
                      const hasPayments = isPaymentSubItem && pendingPayments > 0

                      return (
                        <NavLink
                          key={subItem.to}
                          to={subItem.to}
                          title={subItem.label}
                          className={({ isActive }) => subRowClass(isActive)}
                        >
                          <SubIcon size={14} className="shrink-0" />
                          <span className="truncate">{subItem.label}</span>

                          {/* Green Notification Light on Collect Payments */}
                          {hasPayments && (
                            <span className="ml-auto flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-emerald-500 text-white shadow-sm animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                              {pendingPayments}
                            </span>
                          )}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </div>

      {/* Bottom: theme toggle + sign out */}
      <div className="flex flex-col gap-1.5 px-3 w-full pt-2 border-t border-[#E8DEF8] dark:border-[#2B2930]">
        {canReviewOvertime && onOpenApprovals && (
          <button onClick={onOpenApprovals} className={cn(rowClass(), 'relative py-2')}>
            <Bell size={18} className="shrink-0 text-[#6750A4] dark:text-[#D0BCFF]" />
            {!!pendingApprovals && (
              <span className="absolute top-1 left-6 min-w-[16px] h-4 px-1 bg-red-500 border-2 border-[#F3EDF7] dark:border-[#1D192B] rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {pendingApprovals > 9 ? '9+' : pendingApprovals}
              </span>
            )}
            <span className={labelClass}>Overtime Approvals</span>
          </button>
        )}
        {onToggleChat && (
          <button onClick={onToggleChat} className={cn(rowClass(), 'relative py-2')}>
            <MessageCircle size={18} className="shrink-0 text-[#6750A4] dark:text-[#D0BCFF]" />
            {hasUnread && (
              <span className="absolute top-1 left-5 min-w-[17px] h-4 px-1 bg-rose-500 border-2 border-[#F3EDF7] dark:border-[#1D192B] rounded-full text-[9px] font-black text-white flex items-center justify-center animate-bounce shadow-sm">
                {(unreadChatCount && unreadChatCount > 9) ? '9+' : (unreadChatCount || '1')}
              </span>
            )}
            <span className={labelClass}>Messages</span>
            {hasUnread && expanded && (
              <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                {unreadChatCount ? `${unreadChatCount} new` : 'New'}
              </span>
            )}
          </button>
        )}
        <button onClick={toggleTheme} className={cn(rowClass(), 'py-2')}>
          {isDark ? <Moon size={18} className="shrink-0" /> : <Sun size={18} className="shrink-0" />}
          <span className={labelClass}>Toggle Theme</span>
        </button>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3.5 w-full p-2.5 rounded-2xl text-[#B3261E] dark:text-[#F2B8B5] hover:bg-[#FFD8E4]/50 dark:hover:bg-[#58102B]/40 transition shrink-0"
        >
          <LogOut size={18} className="shrink-0" />
          <span className={labelClass}>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}

/** Mobile: slide-in drawer with live green notification lights */
export function Sidebar({
  onClose,
  mobile,
  onToggleChat,
  hasUnread,
  unreadChatCount,
  onOpenApprovals,
  pendingApprovals,
}: {
  mobile?: boolean
  onClose?: () => void
  onToggleChat?: () => void
  hasUnread?: boolean
  unreadChatCount?: number
  onOpenApprovals?: () => void
  pendingApprovals?: number
}) {
  const { navEntries, staff, canReviewOvertime } = useRoleNavEntries()
  const { pendingPayments, pendingBookings } = useSidebarNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  // Mobile drawer: Keep all category groups collapsed by default so menu is clean and compact
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    accounts: false,
    attendance: false,
    management: false,
  })

  // Accordion behavior: expanding one collapses the others, keeping navigation compact
  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const isAlreadyOpen = !!prev[id]
      if (isAlreadyOpen) {
        // Collapse if clicking the already open category
        return { accounts: false, attendance: false, management: false }
      }
      // Expand only the selected category and collapse the rest
      return {
        accounts: id === 'accounts',
        attendance: id === 'attendance',
        management: id === 'management',
      }
    })
  }

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  const rowClass = (active?: boolean) =>
    cn(
      'relative flex items-center gap-3 w-full p-3 rounded-2xl transition-all shrink-0',
      active
        ? 'bg-[#EADDFF] text-[#21005D] dark:bg-[#4F378B] dark:text-[#EADDFF] shadow-2xs font-bold'
        : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-white dark:hover:bg-[#2B2930]'
    )

  const subRowClass = (active?: boolean) =>
    cn(
      'flex items-center gap-2.5 w-full py-2.5 px-3 rounded-xl transition-all shrink-0 text-xs font-semibold',
      active
        ? 'bg-[#6750A4] text-white dark:bg-[#D0BCFF] dark:text-[#381E72] shadow-xs'
        : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#EADDFF]/50 dark:hover:bg-[#382E48]'
    )

  return (
    <aside className="flex flex-col h-full w-72 bg-[#F3EDF7] dark:bg-[#1D192B] border-r border-[#E8DEF8] dark:border-[#382E48] transition-all duration-300 ease-in-out overflow-hidden">
      {/* Brand header */}
      <div className="px-4 py-4 border-b border-white/60 dark:border-[#2B2930] flex items-center gap-3">
        <div className="w-[36px] h-[36px] shrink-0 rounded-xl overflow-hidden shadow-sm">
          <img src="/logo.png" alt="Nailuxe Logo" className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="text-base font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] tracking-tight">Nailuxe</div>
          <div className="text-[11px] text-[#79747E] dark:text-[#938F99]">Studio Manager</div>
        </div>
      </div>

      {/* User chip */}
      <div className="px-3 py-2.5 border-b border-white/60 dark:border-[#2B2930]">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl bg-[#EADDFF] dark:bg-[#4F378B]">
          <div className="w-7 h-7 rounded-lg bg-[#6750A4] dark:bg-[#D0BCFF] flex items-center justify-center text-white dark:text-[#381E72] text-xs font-bold shrink-0">
            {staff?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#21005D] dark:text-[#EADDFF] truncate">{staff?.name}</div>
            <div className="text-[10px] text-[#4F378B] dark:text-[#CAC4D0] capitalize">{staff?.role}</div>
          </div>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
        {navEntries.map(entry => {
          if (entry.type === 'link') {
            const Icon = entry.icon
            const isBookings = entry.to === '/bookings'
            const showBookingBadge = isBookings && pendingBookings > 0

            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                onClick={onClose}
                className={({ isActive }) => rowClass(isActive)}
              >
                <Icon size={18} className="shrink-0" />
                <span className="text-[13px]">{entry.label}</span>
                {showBookingBadge && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {pendingBookings} pending
                  </span>
                )}
              </NavLink>
            )
          }

          const Icon = entry.icon
          const isOpen = openGroups[entry.id] ?? false
          const isAnyChildActive = entry.items.some(item => location.pathname.startsWith(item.to))
          const isAccounts = entry.id === 'accounts'
          const showAccountsGreenLight = isAccounts && pendingPayments > 0

          return (
            <div key={entry.id} className="flex flex-col w-full my-0.5">
              <button
                onClick={() => toggleGroup(entry.id)}
                className={cn(
                  'flex items-center justify-between w-full p-3 rounded-2xl transition-all text-left',
                  isAnyChildActive
                    ? 'bg-[#EADDFF]/70 text-[#21005D] dark:bg-[#4F378B]/50 dark:text-[#EADDFF] font-bold'
                    : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-white dark:hover:bg-[#2B2930]'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon size={18} className="shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">{entry.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {showAccountsGreenLight && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <span>{pendingPayments}</span>
                    </span>
                  )}
                  <span className="text-[#79747E] dark:text-[#938F99]">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-1 pl-4 mt-1 border-l-2 border-[#D0BCFF]/60 dark:border-[#4F378B]/60 ml-4 py-1 animate-fadeIn">
                  {entry.items.map(subItem => {
                    const SubIcon = subItem.icon
                    const isPaymentSubItem = subItem.to === '/payments'
                    const hasPayments = isPaymentSubItem && pendingPayments > 0

                    return (
                      <NavLink
                        key={subItem.to}
                        to={subItem.to}
                        onClick={onClose}
                        className={({ isActive }) => subRowClass(isActive)}
                      >
                        <SubIcon size={14} className="shrink-0" />
                        <span className="truncate">{subItem.label}</span>
                        {hasPayments && (
                          <span className="ml-auto flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-emerald-500 text-white shadow-sm animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            {pendingPayments}
                          </span>
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom Controls */}
      <div className="px-3 pt-2 pb-6 border-t border-[#E8DEF8] dark:border-[#2B2930] bg-[#ECE6F0]/70 dark:bg-[#15121E]/90 flex flex-col gap-1 shrink-0">
        {canReviewOvertime && onOpenApprovals && (
          <button onClick={onOpenApprovals} className={cn(rowClass(), 'relative py-2')}>
            <Bell size={18} className="shrink-0 text-[#6750A4] dark:text-[#D0BCFF]" />
            {!!pendingApprovals && (
              <span className="absolute top-1 left-6 min-w-[16px] h-4 px-1 bg-red-500 border-2 border-[#F3EDF7] dark:border-[#1D192B] rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {pendingApprovals > 9 ? '9+' : pendingApprovals}
              </span>
            )}
            <span className="text-xs">Overtime Approvals</span>
          </button>
        )}
        {onToggleChat && (
          <button onClick={onToggleChat} className={cn(rowClass(), 'relative py-2')}>
            <MessageCircle size={18} className="shrink-0 text-[#6750A4] dark:text-[#D0BCFF]" />
            {hasUnread && (
              <span className="absolute top-1 left-5 min-w-[17px] h-4 px-1 bg-rose-500 border-2 border-[#F3EDF7] dark:border-[#1D192B] rounded-full text-[9px] font-black text-white flex items-center justify-center animate-bounce shadow-sm">
                {(unreadChatCount && unreadChatCount > 9) ? '9+' : (unreadChatCount || '1')}
              </span>
            )}
            <span className="text-xs">Messages</span>
            {hasUnread && (
              <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                {unreadChatCount ? `${unreadChatCount} new` : 'New'}
              </span>
            )}
          </button>
        )}
        <button onClick={toggleTheme} className={cn(rowClass(), 'py-2')}>
          {isDark ? <Moon size={18} className="shrink-0" /> : <Sun size={18} className="shrink-0" />}
          <span className="text-xs">Toggle Theme</span>
        </button>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full p-2.5 rounded-2xl text-[#B3261E] dark:text-[#F2B8B5] hover:bg-[#FFD8E4]/60 dark:hover:bg-[#58102B]/50 transition shrink-0 font-medium"
        >
          <LogOut size={18} className="shrink-0 text-[#B3261E] dark:text-[#F2B8B5]" />
          <span className="text-xs font-bold">Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
