import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { playNotificationChime } from './useChatNotifications'
import { triggerNativeNotification } from '../lib/nativeNotifications'
import { toTitleCase } from '../lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface OpenBooking {
  id: string
  customer_name: string
  customer_phone: string
  customer_place: string | null
  booking_date: string
  booking_time: string
  services: { service_id?: string; name: string; price: number }[]
  advance_paid: number
  pending_amount: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes: string | null
  assigned_staff_id?: string | null
  started_at?: string | null
  created_at?: string
}

export function useAvailableBookings() {
  const { staff, isAdmin, isImpersonating } = useAuth()
  const qc = useQueryClient()
  const isStaffView = !isAdmin || isImpersonating
  const today = format(new Date(), 'yyyy-MM-dd')

  const lastKnownIdsRef = useRef<Set<string>>(new Set())
  const isFirstLoadRef = useRef(true)

  const { data: availableBookings = [], isLoading } = useQuery<OpenBooking[]>({
    queryKey: ['unassigned_bookings', today],
    queryFn: async () => {
      const { data, error } = await db
        .from('bookings')
        .select('*')
        .is('assigned_staff_id', null)
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .gte('booking_date', today)
        .order('booking_date', { ascending: true })
        .order('booking_time', { ascending: true })

      if (error) {
        console.error('Error fetching unassigned bookings:', error)
        return []
      }
      return data as OpenBooking[]
    },
    refetchInterval: 4000, // Poll every 4 seconds
  })

  // Detect newly added unassigned bookings to alert staff
  useEffect(() => {
    if (!isStaffView || !staff) return

    const currentIds = new Set(availableBookings.map(b => b.id))

    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false
      lastKnownIdsRef.current = currentIds
      return
    }

    // Find any new IDs that appeared since last poll
    const newBookings = availableBookings.filter(b => !lastKnownIdsRef.current.has(b.id))

    if (newBookings.length > 0) {
      const latest = newBookings[0]
      playNotificationChime()
      const svcNames = latest.services?.map(s => s.name).join(', ') || 'Service'
      const clientName = toTitleCase(latest.customer_name)
      const bookingTime = latest.booking_time?.slice(0, 5) || ''

      // Trigger native phone push notification with direct tap navigation
      triggerNativeNotification({
        title: '💅 New Booking Available!',
        body: `${clientName} • ${svcNames} at ${bookingTime}`,
        action: 'navigate',
        route: '/bookings',
      })

      toast(`🔔 New Open Booking!\n${clientName} (${svcNames}) at ${bookingTime}`, {
        duration: 7000,
        position: 'top-center',
        style: {
          background: '#1D192B',
          color: '#ffffff',
          fontWeight: '600',
          fontSize: '13px',
          borderRadius: '16px',
          border: '1px solid #6750A4',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          padding: '12px 18px',
        },
      })
    }

    lastKnownIdsRef.current = currentIds
  }, [availableBookings, isStaffView, staff])

  // Realtime subscription on bookings table with unique channel name
  useEffect(() => {
    try {
      const channelId = `bookings_rt_${Math.random().toString(36).slice(2, 9)}`
      const channel = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          () => {
            qc.invalidateQueries({ queryKey: ['unassigned_bookings'] })
            qc.invalidateQueries({ queryKey: ['my_assigned_bookings'] })
            qc.invalidateQueries({ queryKey: ['bookings'] })
            qc.invalidateQueries({ queryKey: ['sidebar_unassigned_bookings'] })
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    } catch (e) {
      console.warn('Realtime subscription error:', e)
    }
  }, [qc])

  // Claim/Accept booking mutation
  const claimBooking = useMutation({
    mutationFn: async ({ bookingId, staffId }: { bookingId: string; staffId: string }) => {
      const { error } = await db
        .from('bookings')
        .update({
          assigned_staff_id: staffId,
          status: 'confirmed',
        })
        .eq('id', bookingId)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unassigned_bookings'] })
      qc.invalidateQueries({ queryKey: ['my_assigned_bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['sidebar_unassigned_bookings'] })
      toast.success('🎉 Booking accepted and assigned to you!')
    },
    onError: (err: Error) => {
      toast.error(`Failed to claim booking: ${err.message}`)
    },
  })

  // Release/Cancel booking back to the open pool
  const releaseBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await db
        .from('bookings')
        .update({
          assigned_staff_id: null,
          status: 'pending',
        })
        .eq('id', bookingId)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unassigned_bookings'] })
      qc.invalidateQueries({ queryKey: ['my_assigned_bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['sidebar_unassigned_bookings'] })
      toast.success('Booking released back to available pool.')
    },
    onError: (err: Error) => {
      toast.error(`Failed to release booking: ${err.message}`)
    },
  })

  return {
    availableBookings,
    availableCount: availableBookings.length,
    isLoading,
    claimBooking,
    releaseBooking,
  }
}
