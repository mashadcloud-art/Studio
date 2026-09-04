import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getMonthRange } from '../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface WorkRecordRow {
  id: string
  amount: number
  date: string
  staff: { id: string; name: string }
  customers: { id: string; name: string }
  services: { id: string; name: string; category: string | null }
}

export function useMonthlyReport(year: number, month: number) {
  const { start, end } = getMonthRange(year, month)
  return useQuery({
    queryKey: ['monthly_report', year, month],
    queryFn: async () => {
      const { data, error } = await db
        .from('work_records')
        .select(`
          *,
          staff:staff_id ( id, name ),
          customers:customer_id ( id, name ),
          services:service_id ( id, name, category )
        `)
        .gte('date', start)
        .lte('date', end)
        .order('date')
      if (error) throw error

      const records = data as WorkRecordRow[]

      // Aggregate by staff
      const staffMap = new Map<string, {
        staffName: string
        totalAmount: number
        totalCustomers: number
        records: WorkRecordRow[]
      }>()

      for (const record of records) {
        const sid = record.staff?.id
        const sname = record.staff?.name
        if (!staffMap.has(sid)) {
          staffMap.set(sid, { staffName: sname, totalAmount: 0, totalCustomers: 0, records: [] })
        }
        const entry = staffMap.get(sid)!
        entry.totalAmount += record.amount
        entry.totalCustomers += 1
        entry.records.push(record)
      }

      // Aggregate by service
      const serviceMap = new Map<string, { serviceName: string; count: number; revenue: number }>()
      for (const record of records) {
        const svc = record.services
        if (!serviceMap.has(svc.id)) {
          serviceMap.set(svc.id, { serviceName: svc.name, count: 0, revenue: 0 })
        }
        const entry = serviceMap.get(svc.id)!
        entry.count += 1
        entry.revenue += record.amount
      }

      // Daily revenue for chart
      const dailyMap = new Map<string, number>()
      for (const record of records) {
        const prev = dailyMap.get(record.date) ?? 0
        dailyMap.set(record.date, prev + record.amount)
      }

      return {
        totalRevenue: records.reduce((s, r) => s + r.amount, 0),
        totalCustomers: records.length,
        staffSummary: Array.from(staffMap.entries()).map(([id, v]) => ({ id, ...v })),
        serviceSummary: Array.from(serviceMap.values()),
        dailyRevenue: Array.from(dailyMap.entries())
          .map(([date, amount]) => ({ date, amount }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        records,
      }
    },
  })
}

interface StaffWorkRow {
  id: string
  amount: number
  date: string
  start_time: string
  end_time: string | null
  notes: string | null
  customers: { id: string; name: string; phone: string }
  services: { id: string; name: string; price: number; category: string | null }
}

export function useStaffMonthlyReport(staffId: string, year: number, month: number) {
  const { start, end } = getMonthRange(year, month)
  return useQuery({
    queryKey: ['staff_monthly_report', staffId, year, month],
    queryFn: async () => {
      const { data, error } = await db
        .from('work_records')
        .select(`
          *,
          customers:customer_id ( id, name, phone ),
          services:service_id ( id, name, price, category )
        `)
        .eq('staff_id', staffId)
        .gte('date', start)
        .lte('date', end)
        .order('date')
      if (error) throw error

      const records = data as StaffWorkRow[]
      return {
        totalRevenue: records.reduce((s, r) => s + r.amount, 0),
        totalCustomers: records.length,
        records,
      }
    },
    enabled: !!staffId,
  })
}

export function useOvertimeReport(staffId?: string, year?: number, month?: number) {
  return useQuery({
    queryKey: ['overtime', staffId, year, month],
    queryFn: async () => {
      let query = db
        .from('overtime')
        .select('*, staff:staff_id ( id, name )')
        .order('date', { ascending: false })
      if (staffId) query = query.eq('staff_id', staffId)
      if (year && month) {
        const { start, end } = getMonthRange(year, month)
        query = query.gte('date', start).lte('date', end)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
