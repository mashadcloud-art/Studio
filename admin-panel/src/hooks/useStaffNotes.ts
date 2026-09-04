import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface StaffNote {
  id: string
  staff_id: string
  sender_id: string | null
  sender_role: 'admin' | 'staff'
  message: string | null
  voice_url: string | null
  voice_duration: number | null
  created_at: string
}

export function useStaffNotes(staffId: string | undefined) {
  return useQuery({
    queryKey: ['staff_notes', staffId],
    queryFn: async () => {
      if (!staffId) return []
      const { data, error } = await db
        .from('staff_notes')
        .select('*')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as StaffNote[]
    },
    enabled: !!staffId,
    refetchInterval: 4000,       // light polling so it feels like a live chat
    refetchIntervalInBackground: false,
  })
}

export function useSendStaffNote(staffId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      senderId: string
      senderRole: 'admin' | 'staff'
      message?: string
      voiceUrl?: string
      voiceDuration?: number
    }) => {
      if (!staffId) throw new Error('Missing staff id')
      const { data, error } = await db
        .from('staff_notes')
        .insert({
          staff_id: staffId,
          sender_id: params.senderId,
          sender_role: params.senderRole,
          message: params.message ?? null,
          voice_url: params.voiceUrl ?? null,
          voice_duration: params.voiceDuration ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as StaffNote
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff_notes', staffId] }),
  })
}
