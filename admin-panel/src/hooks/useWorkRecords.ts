import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { WorkRecord, WorkRecordWithRelations } from '../types/database'
import { getTodayString } from '../lib/utils'
import { invalidateFinancialQueries } from '../lib/queryInvalidation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const WORK_RECORDS_WITH_RELATIONS = `
  *,
  staff:staff_id ( id, name, phone ),
  customers:customer_id ( id, name, phone ),
  services:service_id ( id, name, price, category )
`

export function useWorkRecords(filters?: {
  staffId?: string
  date?: string
  startDate?: string
  endDate?: string
}) {
  return useQuery({
    queryKey: ['work_records', filters],
    queryFn: async () => {
      let query = db
        .from('work_records')
        .select(WORK_RECORDS_WITH_RELATIONS)
        .order('created_at', { ascending: false })

      if (filters?.staffId) query = query.eq('staff_id', filters.staffId)
      if (filters?.date) query = query.eq('date', filters.date)
      if (filters?.startDate) query = query.gte('date', filters.startDate)
      if (filters?.endDate) query = query.lte('date', filters.endDate)

      const { data, error } = await query
      if (error) throw error
      return data as WorkRecordWithRelations[]
    },
  })
}

export function useTodayWorkRecords(staffId?: string) {
  return useWorkRecords({ staffId, date: getTodayString() })
}

export function useCreateWorkRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: {
      staff_id: string
      customer_id: string
      service_id: string
      start_time: string
      amount: number
      notes?: string
    }) => {
      const { data, error } = await db
        .from('work_records')
        .insert({
          staff_id: record.staff_id,
          customer_id: record.customer_id,
          service_id: record.service_id,
          start_time: record.start_time,
          amount: record.amount,
          notes: record.notes ?? null,
          date: getTodayString(),
        })
        .select(WORK_RECORDS_WITH_RELATIONS)
        .single()
      if (error) throw error
      return data as WorkRecordWithRelations
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work_records'] }),
  })
}

export function useUpdateWorkRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WorkRecord> }) => {
      const { data, error } = await db
        .from('work_records')
        .update(updates)
        .eq('id', id)
        .select(WORK_RECORDS_WITH_RELATIONS)
        .single()
      if (error) throw error
      return data as WorkRecordWithRelations
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work_records'] }),
  })
}

export function useDeleteWorkRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('work_records').delete().eq('id', id)
      if (error) throw error
    },
    // Deleting a work record touches revenue, cash, payroll and every
    // dashboard/report that summarizes it — invalidateFinancialQueries
    // clears all of them together instead of missing whichever one this
    // screen doesn't happen to look at.
    onSuccess: () => invalidateFinancialQueries(qc),
  })
}

// Dashboard stats
export function useDashboardStats(date: string) {
  return useQuery({
    queryKey: ['dashboard_stats', date],
    queryFn: async () => {
      const { data: today, error } = await db
        .from('work_records')
        .select('amount')
        .eq('date', date)
      if (error) throw error

      const totalRevenue = (today as { amount: number }[]).reduce((sum, r) => sum + r.amount, 0)
      const totalCustomers = (today as unknown[]).length

      // Monthly stats
      const monthStart = date.substring(0, 7) + '-01'
      const { data: monthly } = await db
        .from('work_records')
        .select('amount, date')
        .gte('date', monthStart)
        .lte('date', date)

      const monthlyRevenue = (monthly as { amount: number }[] | null)?.reduce((sum, r) => sum + r.amount, 0) ?? 0

      return {
        todayRevenue: totalRevenue,
        todayCustomers: totalCustomers,
        monthlyRevenue,
      }
    },
  })
}
