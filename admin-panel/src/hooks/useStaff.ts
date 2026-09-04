import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Staff } from '../types/database'

// Cast to any to bypass complex Supabase generic inference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function useStaffList() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await db.from('staff').select('*').order('name')
      if (error) throw error
      return data as Staff[]
    },
  })
}

export function useStaffById(id: string | undefined) {
  return useQuery({
    queryKey: ['staff', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await db.from('staff').select('*').eq('id', id).single()
      if (error) throw error
      return data as Staff
    },
    enabled: !!id,
  })
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      name: string
      phone: string
      address?: string
      joining_date: string
      salary: number
      role: 'admin' | 'staff'
      email: string
      password: string
    }) => {
      const { data, error } = await db
        .from('staff')
        .insert({
          name: params.name,
          phone: params.phone,
          address: params.address ?? null,
          joining_date: params.joining_date,
          salary: params.salary,
          role: params.role,
          active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as Staff
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

export function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Staff> }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let payload: any = { ...updates }
      let res = await db.from('staff').update(payload).eq('id', id).select().single()

      // If schema cache says column not found (e.g. overtime_rate, staff_code, etc.)
      while (res.error && res.error.message?.includes('schema cache')) {
        const match = res.error.message.match(/'([^']+)' column/)
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]]
          res = await db.from('staff').update(payload).eq('id', id).select().single()
        } else {
          break
        }
      }

      if (res.error) throw res.error
      return res.data as Staff
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}

export function useDeleteStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('staff').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })
}
