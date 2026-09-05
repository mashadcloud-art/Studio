import { useState, useRef, useEffect } from 'react'
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
import { initNativeNotifications, registerNotificationTapHandler } from '../../lib/nativeNotifications'

// Routes that render their own full-bleed hero/header and don't want the generic mobile topbar.
const NO_TOPBAR_ROUTES = ['/my-profile']

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [approvalsOpen, setApprovalsOpen] = useState(false)
  const [navVisible, setNavVisible] = useState(true)
  const lastScrollTopRef = useRef(0)
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

  // Request native push/device notifications on mount and register deep linking tap action
  useEffect(() => {
    initNativeNotifications()
    registerNotificationTapHandler(({ action, route }) => {
      if (action === 'chat') {
        setChatOpen(true)
      } else if (action === 'overtime') {
        setApprovalsOpen(true)
      } else if (route) {
        navigate(route)
      }
    })
  }, [navigate])

  // Reset visibility when route changes
  useEffect(() => {
    setNavVisible(true)
    lastScrollTopRef.current = 0
  }, [location.pathname])

  // Intelligent auto-hide on scroll: hide when scrolling down, show when scrolling up
  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop
    const delta = currentScrollTop - lastScrollTopRef.current

    if (currentScrollTop < 45) {
      if (!navVisible) setNavVisible(true)
      lastScrollTopRef.current = currentScrollTop
      return
    }

    if (delta > 8 && navVisible) {
      setNavVisible(false)
    } else if (delta < -8 && !navVisible) {
      setNavVisible(true)
    }

    lastScrollTopRef.current = currentScrollTop
  }

  // Also listen to native window scroll on mobile devices so browser URL address bar collapses automatically like Hostinger
  useEffect(() => {
    const onWindowScroll = () => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop
      const delta = currentScrollTop - lastScrollTopRef.current

      if (currentScrollTop < 45) {
        if (!navVisible) setNavVisible(true)
        lastScrollTopRef.current = currentScrollTop
        return
      }

      if (delta > 8 && navVisible) {
        setNavVisible(false)
      } else if (delta < -8 && !navVisible) {
        setNavVisible(true)
      }

      lastScrollTopRef.current = currentScrollTop
    }

    window.addEventListener('scroll', onWindowScroll, { passive: true })
    return () => window.removeEventListener('scroll', onWindowScroll)
  }, [navVisible])

  return (
    <div className="flex min-h-screen lg:h-screen lg:overflow-hidden bg-[#FEF7FF] dark:bg-[#141218] transition-colors duration-300">
      {/* Desktop: slim icon-only rail */}
      <IconSidebar
        onToggleChat={() => setChatOpen(!chatOpen)} hasUnread={hasUnread} unreadChatCount={unreadChatCount}
        onOpenApprovals={() => setApprovalsOpen(!approvalsOpen)} pendingApprovals={pendingApprovals}
      />

      {/* Mobile: slide-in full drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex h-[100dvh] overflow-hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full">
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
      <div className="flex-1 flex flex-col min-w-0 relative lg:overflow-hidden">
        {/* Impersonation Top Banner */}
        {isImpersonating && staff && (
          <div className="bg-gradient-to-r from-[#4F378B] via-[#6750A4] to-[#7F67BE] text-white px-4 pt-[max(env(safe-area-inset-top),24px)] pb-3 shadow-lg flex items-center justify-between z-[100] text-xs sm:text-sm font-medium border-b border-white/10 shrink-0 sticky top-0">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="p-1.5 bg-white/20 rounded-lg text-sm shrink-0">👑</span>
              <span className="truncate">
                <strong>Admin Mode:</strong> <span className="font-bold text-amber-300 capitalize">{toTitleCase(staff.name)}</span>{' '}
                <span className="opacity-80 text-[11px] hidden sm:inline">({staff.role === 'receptionist' ? 'Receptionist' : 'Stylist'})</span>
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                exitStaffView()
                navigate('/staff')
              }}
              className="px-3.5 py-2 bg-white text-[#21005D] text-xs font-black rounded-xl hover:bg-amber-100 transition-all shadow-md active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>✕</span> Exit Staff View
            </button>
          </div>
        )}
        {/* Mobile topbar: sticky at top with pure white/dark background matching status bar */}
        {hideTopbar ? (
          <div className="lg:hidden absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-4 pt-4">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open menu"
              className="relative w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition active:scale-95 cursor-pointer">
              <Menu size={18} />
              {(hasUnread || pendingApprovals > 0) && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#E11D48] ring-2 ring-white dark:ring-[#1D192B] animate-pulse" />
              )}
            </button>
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center">
              <ThemeToggle className="scale-[0.7]" />
            </div>
          </div>
        ) : (
          <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2.5 bg-white dark:bg-[#1D192B] border-b border-[#E8DEF8]/70 dark:border-[#2B2930] shrink-0 transition-colors shadow-2xs">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setSidebarOpen(true)} className="relative p-2 rounded-xl text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition active:scale-95 cursor-pointer">
                <Menu size={20} />
                {(hasUnread || pendingApprovals > 0) && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#E11D48] ring-2 ring-white dark:ring-[#1D192B] animate-pulse" />
                )}
              </button>
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Nailuxe" className="w-6 h-6 object-contain rounded-md shadow-2xs" />
                <span className="font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] text-sm tracking-tight">Nailuxe</span>
              </div>
            </div>
            <ThemeToggle />
          </div>
        )}

        {/* Page Container: allows natural window scrolling on mobile for browser URL collapse */}
        <main
          onScroll={handleScroll}
          className={cn('flex-1 lg:overflow-y-auto overscroll-contain', mobileNavItems.length > 0 && 'pb-24 lg:pb-0')}
        >
          <div className={hideTopbar ? 'w-full lg:p-6' : 'p-4 sm:p-6 w-full'}>
            <Outlet />
          </div>
        </main>

        {/* Edge-to-Edge Intelligent Auto-Hiding Mobile Bottom Nav Bar */}
        {mobileNavItems.length > 0 && (
          <nav
            aria-label="Mobile Navigation"
            className={cn(
              'lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#F3EDF7]/95 dark:bg-[#1C1A24]/95 backdrop-blur-xl border-t border-[#E8DEF8] dark:border-[#332F42] px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-out will-change-transform',
              navVisible ? 'translate-y-0' : 'translate-y-full pointer-events-none'
            )}
          >
            {mobileNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl transition-all duration-200 min-w-[58px]',
                  isActive
                    ? 'text-[#21005D] dark:text-[#D0BCFF] font-black'
                    : 'text-[#49454F] dark:text-[#CAC4D0] opacity-80 hover:opacity-100'
                )}
              >
                {({ isActive }) => (
                  <>
                    <div className={cn(
                      'px-4 py-1 rounded-full flex items-center justify-center transition-all duration-200',
                      isActive
                        ? 'bg-[#EADDFF] dark:bg-[#4F378B] scale-105 shadow-xs'
                        : 'hover:bg-[#EADDFF]/40 dark:hover:bg-[#382E48]'
                    )}>
                      <Icon size={19} />
                    </div>
                    <span className="text-[10px] tracking-tight">{label}</span>
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
        position="top-center"
        containerStyle={{
          top: 76,
        }}
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'Inter, sans-serif',
            background: 'rgba(29, 25, 43, 0.96)',
            color: '#FFFFFF',
            border: '1px solid rgba(232, 222, 248, 0.25)',
            boxShadow: '0 12px 36px -4px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(16px)',
            padding: '10px 18px',
          },
          success: {
            iconTheme: {
              primary: '#79DF84',
              secondary: '#1D192B',
            },
            style: {
              border: '1px solid rgba(121, 223, 132, 0.45)',
            },
          },
          error: {
            iconTheme: {
              primary: '#FFB4AB',
              secondary: '#690005',
            },
            style: {
              background: 'rgba(43, 20, 25, 0.96)',
              color: '#FFDAD6',
              border: '1px solid rgba(255, 180, 171, 0.45)',
            },
          },
        }}
      />
    </div>
  )
}
