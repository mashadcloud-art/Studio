import { format } from 'date-fns'
import { TrendingUp, Users, Sparkles, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffMonthlyReport } from '../../hooks/useReports'
import { supabase } from '../../lib/supabase'
import { formatDate, formatCurrency, getMonthRange, minutesToHoursMinutes } from '../../lib/utils'
import { ProfileSectionHeader } from '../../components/staff/ProfileSectionHeader'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function MyProfilePerformance() {
  const { staff } = useAuth()
  const now = new Date()
  const { data: report, isLoading } = useStaffMonthlyReport(staff?.id ?? '', now.getFullYear(), now.getMonth() + 1)
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1)

  // Reads the same `overtime` table Payroll reads from — only approved days
  // land here (see useReviewOvertime), so this is exactly what will show up
  // as overtime pay once payroll is run this month.
  const { data: overtimeRows = [] } = useQuery({
    queryKey: ['my_overtime', staff?.id, start, end],
    queryFn: async () => {
      const { data, error } = await db.from('overtime').select('total_minutes')
        .eq('staff_id', staff!.id).gte('date', start).lte('date', end)
      if (error) throw error
      return data as { total_minutes: number }[]
    },
    enabled: !!staff,
  })

  if (!staff) return null

  const records = report?.records.slice(0, 12) ?? []
  const totalCustomers = report?.totalCustomers ?? 0
  const totalRevenue = report?.totalRevenue ?? 0
  const avgTicket = totalCustomers > 0 ? totalRevenue / totalCustomers : 0
  const overtimeMinutes = overtimeRows.reduce((sum, r) => sum + (r.total_minutes ?? 0), 0)
  const overtimePay = Math.round((overtimeMinutes / 60) * (staff.overtime_rate ?? 0) * 100) / 100

  return (
    <div className="space-y-2">
      <ProfileSectionHeader title="Performance" subtitle={format(now, 'MMMM yyyy')} />

      <div style={{ maxWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { title: 'Revenue', value: formatCurrency(totalRevenue), icon: <TrendingUp size={18} /> },
            { title: 'Customers', value: totalCustomers, icon: <Users size={18} /> },
            { title: 'Avg. Ticket', value: formatCurrency(avgTicket), icon: <Sparkles size={18} /> },
            {
              title: 'Overtime (Approved)',
              value: minutesToHoursMinutes(overtimeMinutes),
              icon: <Clock size={18} />,
              subtitle: overtimePay > 0 ? `${formatCurrency(overtimePay)} pay` : undefined,
            },
          ].map(s => (
            <div
              key={s.title}
              className="rounded-2xl bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48]"
              style={{ padding: 18, textAlign: 'center' }}
            >
              <div className="text-[#6750A4] dark:text-[#D0BCFF]" style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{s.icon}</div>
              <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
              {s.subtitle && (
                <div className="text-[#6750A4] dark:text-[#D0BCFF]" style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{s.subtitle}</div>
              )}
              <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.title}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent Work</div>
          {isLoading ? (
            <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ textAlign: 'center', padding: '24px 0', fontSize: 13 }}>Loading…</div>
          ) : records.length === 0 ? (
            <div
              className="rounded-2xl bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] text-[#938F99] dark:text-[#CAC4D0]"
              style={{ textAlign: 'center', padding: '32px 0', fontSize: 13 }}
            >
              No completed work this month yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {records.map(r => (
                <div
                  key={r.id}
                  className="rounded-[10px] bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48]"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      className="rounded-[9px] bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]"
                      style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}
                    >
                      {(r.customers as { name: string })?.name?.charAt(0)}
                    </div>
                    <div>
                      <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 600 }}>{(r.customers as { name: string })?.name}</div>
                      <div className="text-[#938F99] dark:text-[#CAC4D0]" style={{ fontSize: 11 }}>{(r.services as { name: string })?.name} · {formatDate(r.date)}</div>
                    </div>
                  </div>
                  <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 14, fontWeight: 800 }}>{formatCurrency(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
