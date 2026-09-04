import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { TrendingUp, Users, DollarSign, Plus, Calendar } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useDashboardStats, useWorkRecords } from '../../hooks/useWorkRecords'
import { useMonthlyReport } from '../../hooks/useReports'
import { useStaffList } from '../../hooks/useStaff'
import { formatCurrency, getTodayString, formatTime } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

export function Dashboard() {
  const today = getTodayString()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { staff } = useAuth()

  const { data: stats } = useDashboardStats(today)
  const { data: monthlyReport } = useMonthlyReport(year, month)
  const { data: todayRecords } = useWorkRecords({ date: today })
  const { data: staffList } = useStaffList()

  // Fetch today's scheduled bookings directly so upcoming appointments show on the Dashboard
  const { data: todayBookings = [] } = useQuery({
    queryKey: ['dashboard_today_bookings', today],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('bookings')
        .select('*, staff:assigned_staff_id(id, name)')
        .eq('booking_date', today)
        .neq('status', 'cancelled')
        .order('booking_time', { ascending: true })
      if (error) {
        console.error('dashboard_today_bookings error:', error)
        return []
      }
      return data ?? []
    },
  })

  // Combine scheduled bookings and completed work records for Today's Sessions
  const allTodaySessions = useMemo(() => {
    const list: {
      id: string
      type: 'booking' | 'work_record'
      name: string
      serviceText: string
      staffText: string
      amount: number
      timeText: string
      status?: string
    }[] = []

    // 1. Scheduled bookings for today
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    todayBookings.forEach((b: any) => {
      const svcNames = Array.isArray(b.services)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? b.services.map((s: any) => s.name).join(', ')
        : 'Salon Service'
      const totalAmt = Number(b.pending_amount) + Number(b.advance_paid) || 0
      list.push({
        id: `bk-${b.id}`,
        type: 'booking',
        name: b.customer_name || 'Client',
        serviceText: svcNames,
        staffText: b.staff?.name ? `Stylist: ${b.staff.name}` : 'Unassigned Stylist',
        amount: totalAmt,
        timeText: b.booking_time ? b.booking_time.slice(0, 5) : 'Today',
        status: b.status || 'confirmed',
      })
    })

    // 2. Completed work records today (avoid duplicates if same customer already listed)
    if (todayRecords && todayRecords.length > 0) {
      todayRecords.forEach(r => {
        const clientName = (r.customers as { name: string })?.name || 'Walk-in Client'
        if (list.some(item => item.name.toLowerCase().trim() === clientName.toLowerCase().trim())) return

        list.push({
          id: `wr-${r.id}`,
          type: 'work_record',
          name: clientName,
          serviceText: (r.services as { name: string })?.name || 'Salon Service',
          staffText: (r.staff as { name: string })?.name ? `Stylist: ${(r.staff as { name: string }).name}` : 'Stylist',
          amount: Number(r.amount) || 0,
          timeText: r.start_time ? formatTime(r.start_time) : 'Done',
          status: 'completed',
        })
      })
    }

    return list
  }, [todayBookings, todayRecords])

  // Live clock, mirrors the Material You mockup's pulsing time chip
  const [clock, setClock] = useState(() => format(new Date(), 'HH:mm'))
  useEffect(() => {
    const id = setInterval(() => setClock(format(new Date(), 'HH:mm')), 1000 * 15)
    return () => clearInterval(id)
  }, [])

  const topStaff = monthlyReport?.staffSummary
    .sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5) ?? []

  const topServices = monthlyReport?.serviceSummary
    .sort((a, b) => b.count - a.count).slice(0, 5) ?? []

  const greeting = () => {
    const h = now.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const totalTodayClients = Math.max(stats?.todayCustomers ?? 0, allTodaySessions.length)

  const kpis = [
    {
      label: "Today's Revenue", value: formatCurrency(stats?.todayRevenue ?? 0),
      icon: <DollarSign size={16} />, badge: '+0%',
      badgeClass: 'text-[#146C2E] dark:text-[#79DF84] bg-[#C4EED0] dark:bg-[#003913]',
    },
    {
      label: "Today's Clients", value: String(totalTodayClients),
      icon: <Users size={16} />, badge: allTodaySessions.length > 0 ? `${allTodaySessions.length} Scheduled` : 'Active',
      badgeClass: 'text-[#001D35] dark:text-[#9CB4CC] bg-[#C2E7FF] dark:bg-[#003355]',
    },
    {
      label: 'Monthly Revenue', value: formatCurrency(stats?.monthlyRevenue ?? 0),
      icon: <TrendingUp size={16} />, badge: '',
      badgeClass: 'text-[#146C2E] dark:text-[#79DF84] bg-[#C4EED0] dark:bg-[#003913]',
    },
    {
      label: 'Active Staff', value: String(staffList?.filter(s => s.active).length ?? 0),
      icon: <Users size={16} />, badge: 'Online',
      badgeClass: 'text-[#31111D] dark:text-[#FFB3C7] bg-[#FFD8E4] dark:bg-[#58102B]',
    },
  ]

  const maxDaily = Math.max(1, ...(monthlyReport?.dailyRevenue ?? []).map(d => d.amount))

  return (
    <div className="space-y-4 max-w-4xl mx-auto">

      {/* Greeting row */}
      <div className="flex items-end justify-between gap-3 flex-wrap px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1A22] dark:text-[#E6E0E9]">
            {greeting()}, {staff?.name?.split(' ')[0]}
          </h1>
          <p className="text-xs font-medium text-[#49454F] dark:text-[#CAC4D0] mt-0.5">
            {format(now, 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0] text-xs font-semibold rounded-full flex items-center gap-2 border border-[#CAC4D0] dark:border-[#44474F]">
            <span className="w-2 h-2 rounded-full bg-[#6750A4] dark:bg-[#D0BCFF] animate-pulse" />
            <span className="font-mono">{clock}</span>
          </div>
          <Link
            to="/bookings"
            className="text-xs font-bold text-white bg-[#6750A4] dark:bg-[#D0BCFF] dark:text-[#381E72] px-4 py-3 rounded-full shadow-md hover:opacity-95 transition active:scale-95 flex items-center gap-1.5"
          >
            <Plus size={14} />
            <span>New Booking</span>
          </Link>
        </div>
      </div>

      {/* KPI tonal grid */}
      <div className="bg-[#E8DEF8] dark:bg-[#251D3A] p-4 rounded-[28px] shadow-sm relative overflow-hidden border border-[#D0BCFF]/40 dark:border-[#4F378B]/40">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#4A4458] dark:text-[#E8DEF8] bg-[#F3EDF7] dark:bg-[#382E48] px-3 py-1 rounded-full">
            Overview Metrics (Click to View Category)
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#6750A4] dark:bg-[#D0BCFF] animate-ping" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map(card => {
            const getLinkTarget = () => {
              if (card.label.includes('Revenue') && !card.label.includes('Monthly')) return '/sales'
              if (card.label.includes('Clients')) return '/bookings'
              if (card.label.includes('Monthly')) return '/finance'
              if (card.label.includes('Staff')) return '/staff'
              return '/dashboard'
            }
            return (
              <Link
                key={card.label}
                to={getLinkTarget()}
                title={`View ${card.label} details`}
                className="bg-[#F3EDF7] dark:bg-[#1D192B] p-3.5 rounded-2xl flex flex-col justify-between border border-[#D0BCFF]/50 dark:border-[#4F378B]/50 hover:border-[#6750A4] dark:hover:border-[#D0BCFF] hover:shadow-md transition-all active:scale-[0.98] group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-full bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF] flex items-center justify-center group-hover:scale-105 transition-transform">
                    {card.icon}
                  </div>
                  {card.badge && (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${card.badgeClass}`}>
                      {card.badge}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-medium text-[#49454F] dark:text-[#CAC4D0] flex items-center justify-between">
                    <span>{card.label}</span>
                    <span className="text-[10px] text-[#6750A4] dark:text-[#D0BCFF] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                  </p>
                  <h3 className="text-lg font-bold mt-0.5 font-mono text-[#1D1A22] dark:text-[#E6E0E9]">{card.value}</h3>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Today's Sessions */}
      <div className="bg-[#F3EDF7] dark:bg-[#2B2930] p-4 rounded-[28px] border border-[#E6E0E9] dark:border-[#44474F] shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6750A4] dark:text-[#D0BCFF]">Today's Sessions</h2>
            <p className="text-[11px] text-[#49454F] dark:text-[#CAC4D0]">
              {allTodaySessions.length} appointment{allTodaySessions.length !== 1 ? 's' : ''} scheduled
            </p>
          </div>
          <Link
            to="/bookings"
            className="px-3 py-1.5 rounded-xl bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF] hover:bg-[#D0BCFF] dark:hover:bg-[#6750A4] flex items-center gap-1.5 transition text-xs font-bold"
          >
            <span>View All</span>
            <Plus size={14} />
          </Link>
        </div>

        {allTodaySessions.length === 0 ? (
          <div className="py-6 bg-[#FEF7FF] dark:bg-[#1D192B] rounded-2xl flex flex-col items-center justify-center text-center px-4 border border-[#E8DEF8] dark:border-[#382E48]">
            <Calendar size={26} className="text-[#6750A4] dark:text-[#D0BCFF] mb-1.5" />
            <p className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">No sessions today yet</p>
            <p className="text-[10px] text-[#49454F] dark:text-[#CAC4D0] mt-0.5">Bookings will show up instantly here</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {allTodaySessions.map(s => (
              <Link
                key={s.id}
                to="/bookings"
                title="Click to view booking in calendar"
                className="flex items-center gap-3 p-3 rounded-2xl bg-[#FEF7FF] dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] hover:border-[#6750A4] hover:shadow-2xs transition-all active:scale-[0.99] cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] font-bold flex items-center justify-center shrink-0 text-sm font-mono">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold truncate text-[#1D1A22] dark:text-[#E6E0E9]">
                      {s.name}
                    </span>
                    {s.status && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold capitalize ${
                        s.status === 'confirmed'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : s.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {s.status}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#49454F] dark:text-[#CAC4D0] mt-0.5 truncate">
                    {s.serviceText} · {s.staffText}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold font-mono text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(s.amount)}</div>
                  <div className="text-[10px] text-[#6750A4] dark:text-[#D0BCFF] font-semibold">{s.timeText}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Revenue chart (Clickable to Accounts / Finance) */}
      <div className="bg-[#EADDFF] dark:bg-[#332D41] p-4 rounded-[28px] border border-[#D0BCFF]/50 dark:border-[#4F378B]/50 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#21005D] dark:text-[#EADDFF]">Monthly Revenue (Accounts)</h2>
            <p className="text-[11px] text-[#49454F] dark:text-[#CAC4D0]">{format(now, 'MMMM yyyy')}</p>
          </div>
          <Link
            to="/finance"
            className="text-xs font-bold text-[#21005D] dark:text-[#381E72] bg-[#FEF7FF] dark:bg-[#D0BCFF] px-3 py-1.5 rounded-full font-mono hover:opacity-90 transition shadow-2xs flex items-center gap-1"
          >
            <span>{formatCurrency(stats?.monthlyRevenue ?? 0)}</span>
            <span className="text-[10px]">↗</span>
          </Link>
        </div>
        <Link to="/finance" title="Click to view Accounts & P&L Report" className="block bg-[#FEF7FF] dark:bg-[#1D192B] rounded-2xl p-3 border border-[#E8DEF8] dark:border-[#382E48] hover:border-[#6750A4] transition-colors cursor-pointer">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyReport?.dailyRevenue ?? []} barSize={14}>
              <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-[#E8DEF8] dark:text-[#382E48]" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.split('-')[2]}
                tick={{ fontSize: 11, fill: '#6750A4', fontFamily: 'Inter' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6750A4', fontFamily: 'Inter' }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                formatter={(v: unknown) => [formatCurrency(Number(v)), 'Revenue']}
                contentStyle={{
                  borderRadius: 12, border: '1px solid #D0BCFF',
                  fontSize: 12, fontFamily: 'Inter', background: '#FEF7FF',
                  boxShadow: '0 4px 12px rgba(103,80,164,0.15)',
                }}
                cursor={{ fill: '#EADDFF', radius: 4 }}
              />
              <Bar dataKey="amount" fill="#6750A4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {maxDaily <= 1 && !monthlyReport?.dailyRevenue?.length && (
            <p className="text-center text-[11px] text-[#49454F] dark:text-[#CAC4D0] py-2">No revenue recorded yet this month</p>
          )}
        </Link>
      </div>

      {/* Top Services (Clickable to Services) */}
      <div className="bg-[#F3EDF7] dark:bg-[#2B2930] p-4 rounded-[28px] border border-[#E6E0E9] dark:border-[#44474F] shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#6750A4] dark:text-[#D0BCFF]">Top Services</h2>
          <Link to="/services" className="text-[11px] font-bold text-[#6750A4] dark:text-[#D0BCFF] hover:underline flex items-center gap-1">
            Manage Services ↗
          </Link>
        </div>
        {topServices.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#49454F] dark:text-[#CAC4D0]">No data yet</div>
        ) : (
          <div className="space-y-2">
            {topServices.map((s, i) => (
              <Link
                key={s.serviceName}
                to="/services"
                title="View Service Details"
                className="block p-3 rounded-2xl bg-[#FEF7FF] dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] hover:border-[#6750A4] transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF] text-xs font-bold flex items-center justify-center font-mono">
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold text-[#1D1A22] dark:text-[#E6E0E9]">{s.serviceName}</span>
                  </div>
                  <span className="text-[11px] font-bold text-[#21005D] dark:text-[#D0BCFF] bg-[#EADDFF] dark:bg-[#382E48] px-2.5 py-1 rounded-full font-mono">
                    {s.count}×
                  </span>
                </div>
                <div className="h-1.5 bg-[#E8DEF8] dark:bg-[#382E48] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6750A4] dark:bg-[#D0BCFF] rounded-full transition-all duration-500"
                    style={{ width: `${(s.count / (topServices[0]?.count || 1)) * 100}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Top Performers */}
      <div className="bg-[#E8DEF8] dark:bg-[#251D3A] p-4 rounded-[28px] border border-[#D0BCFF]/40 dark:border-[#4F378B]/40 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#4A4458] dark:text-[#E8DEF8]">Top Performers</h2>
          <span className="text-[10px] text-[#49454F] dark:text-[#CAC4D0] font-mono">{format(now, 'MMM yyyy')}</span>
        </div>
        {topStaff.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#49454F] dark:text-[#CAC4D0]">No data this month</div>
        ) : (
          <div className="space-y-2">
            {topStaff.map((s, i) => (
              <div
                key={s.id}
                className={`p-3.5 rounded-2xl flex items-center justify-between border shadow-2xs ${
                  i === 0
                    ? 'bg-[#6750A4] dark:bg-[#D0BCFF] border-[#6750A4] dark:border-[#D0BCFF]'
                    : 'bg-[#FEF7FF] dark:bg-[#1D192B] border-[#E8DEF8] dark:border-[#382E48]'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={`w-10 h-10 rounded-full font-bold flex items-center justify-center shrink-0 shadow-sm text-sm font-mono ${
                      i === 0
                        ? 'bg-white/20 text-white dark:bg-[#381E72]/30 dark:text-[#381E72]'
                        : 'bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF]'
                    }`}
                  >
                    {s.staffName?.charAt(0)}
                  </div>
                  <div className="truncate pr-2">
                    <h4 className={`text-xs font-bold tracking-tight truncate ${i === 0 ? 'text-white dark:text-[#381E72]' : 'text-[#1D1A22] dark:text-[#E6E0E9]'}`}>
                      {s.staffName}
                    </h4>
                    <p className={`text-[10px] mt-0.5 ${i === 0 ? 'text-white/70 dark:text-[#381E72]/70' : 'text-[#49454F] dark:text-[#CAC4D0]'}`}>
                      {s.totalCustomers} clients serviced
                    </p>
                  </div>
                </div>
                <div
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold font-mono ${
                    i === 0
                      ? 'bg-white/20 text-white dark:bg-[#381E72]/30 dark:text-[#381E72]'
                      : 'bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF]'
                  }`}
                >
                  {formatCurrency(s.totalAmount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
