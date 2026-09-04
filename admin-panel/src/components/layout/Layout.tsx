import { useState } from 'react'
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { IconSidebar, Sidebar, bottomNavItems } from './Sidebar'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useAuth } from '../../contexts/AuthContext'
import { cn, toTitleCase } from '../../lib/utils'
import { Toaster } from 'react-hot-toast'
import { GlobalChatDrawer } from '../chat/GlobalChatDrawer'
import { useChatNotifications } from '../../hooks/useChatNotifications'
import { useAvailableBookings } from '../../hooks/useAvailableBookings'
import { OvertimeApprovalsDrawer } from '../notifications/OvertimeApprovalsDrawer'
import { useNotifications, unreadCount } from '../../hooks/useNotifications'

// Routes that render their own full-bleed hero/header and don't want the generic mobile topbar.
const NO_TOPBAR_ROUTES = ['/my-profile']

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [approvalsOpen, setApprovalsOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { staff, isAdmin, isImpersonating, exitStaffView } = useAuth()
  const { hasUnread, unreadCount: unreadChatCount } = useChatNotifications(chatOpen)
  useAvailableBookings() // Live monitoring of open bookings with chime & toast alerts for staff
  const { data: notifications = [] } = useNotifications()
  const pendingApprovals = unreadCount(notifications, staff?.id)

  const effectiveAdmin = isAdmin && !isImpersonating
  const roleKey = effectiveAdmin ? 'admin' : staff?.role === 'receptionist' ? 'receptionist' : 'staff'
  const mobileNavItems = bottomNavItems[roleKey] ?? []
  const hideTopbar = NO_TOPBAR_ROUTES.includes(location.pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-[#FEF7FF] dark:bg-[#141218] transition-colors duration-300">
      {/* Desktop: slim icon-only rail */}
      <IconSidebar
        onToggleChat={() => setChatOpen(!chatOpen)} hasUnread={hasUnread} unreadChatCount={unreadChatCount}
        onOpenApprovals={() => setApprovalsOpen(!approvalsOpen)} pendingApprovals={pendingApprovals}
      />

      {/* Mobile: slide-in full drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">
            <Sidebar
              mobile onClose={() => setSidebarOpen(false)}
              onToggleChat={() => { setSidebarOpen(false); setChatOpen(true); }} hasUnread={hasUnread} unreadChatCount={unreadChatCount}
              onOpenApprovals={() => { setSidebarOpen(false); setApprovalsOpen(true); }} pendingApprovals={pendingApprovals}
            />
          </div>
          <button onClick={() => setSidebarOpen(false)}
            className="absolute top-4 right-4 z-20 p-2 bg-white dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9] rounded-lg">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Impersonation Top Banner */}
        {isImpersonating && staff && (
          <div className="bg-gradient-to-r from-[#4F378B] via-[#6750A4] to-[#7F67BE] text-white px-4 py-2.5 shadow-md flex items-center justify-between z-40 text-xs sm:text-sm font-medium border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-white/20 rounded-md text-xs">👑</span>
              <span>
                <strong>Admin Mode:</strong> Logged in as{' '}
                <span className="font-bold text-amber-300 capitalize">{toTitleCase(staff.name)}</span>{' '}
                <span className="opacity-85 text-xs">({staff.role === 'receptionist' ? 'Receptionist' : 'Staff / Stylist'})</span>
              </span>
            </div>
            <button
              onClick={() => {
                exitStaffView()
                navigate('/staff')
              }}
              className="px-3 py-1 bg-white text-[#21005D] text-xs font-bold rounded-lg hover:bg-amber-100 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>✕</span> Exit Staff View
            </button>
          </div>
        )}
        {/* Mobile topbar: normal in-flow bar, or a transparent overlay for routes with their own hero header */}
        {hideTopbar ? (
          <div className="lg:hidden absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-4 pt-4">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open menu"
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition active:scale-95">
              <Menu size={18} />
            </button>
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center">
              <ThemeToggle className="scale-[0.7]" />
            </div>
          </div>
        ) : (
          <div className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-[#1D192B] border-b border-[#E8DEF8] dark:border-[#2B2930] shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930]">
                <Menu size={18} />
              </button>
              <span className="font-bold text-[#1D1A22] dark:text-[#E6E0E9] text-sm">Nailuxe</span>
            </div>
            <ThemeToggle />
          </div>
        )}

        {/* Page */}
        <main className={cn('flex-1 overflow-y-auto', mobileNavItems.length > 0 && 'pb-24 lg:pb-0')}>
          <div className={hideTopbar ? 'w-full lg:p-6' : 'p-6 w-full'}>
            <Outlet />
          </div>
        </main>

        {/* Mobile floating bottom nav */}
        {mobileNavItems.length > 0 && (
          <nav className="lg:hidden absolute bottom-3 inset-x-4 bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E6E0E9] dark:border-[#44474F] px-3 py-2.5 flex items-center justify-around z-40 rounded-full shadow-lg">
            {mobileNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 rounded-full transition',
                  isActive ? 'text-[#21005D] dark:text-[#D0BCFF]' : 'text-[#49454F] dark:text-[#CAC4D0]'
                )}
              >
                {({ isActive }) => (
                  <>
                    <div className={cn('px-4 py-1 rounded-full flex items-center justify-center', isActive && 'bg-[#EADDFF] dark:bg-[#4F378B]')}>
                      <Icon size={18} />
                    </div>
                    <span className="text-[10px] font-bold">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <GlobalChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      <OvertimeApprovalsDrawer isOpen={approvalsOpen} onClose={() => setApprovalsOpen(false)} />

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: '12px',
            fontSize: '13px',
            fontFamily: 'Inter, sans-serif',
            background: '#fff',
            color: '#18181b',
            border: '1px solid #e4e4e7',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
        }}
      />
    </div>
  )
}
