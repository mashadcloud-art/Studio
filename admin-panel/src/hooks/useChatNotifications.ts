import { useEffect, useState, useRef, useCallback } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { toTitleCase } from '../lib/utils'
import toast from 'react-hot-toast'

// Synthesize a clean, luxury 2-tone chime using Web Audio API
export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Tone 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.12, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.3)

    // Tone 2: A5 (880 Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.08)
    gain2.gain.setValueAtTime(0.15, now + 0.08)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.08)
    osc2.stop(now + 0.45)
  } catch (e) {
    console.warn('Audio chime warning:', e)
  }
}

export function useChatNotifications(isChatOpen: boolean) {
  const { staff: currentAdmin, isAdmin } = useAuth()
  const qc = useQueryClient()
  const lastKnownMaxCreatedRef = useRef<string | null>(null)
  const isFirstMountRef = useRef(true)

  const getLastReadTime = useCallback(() => {
    return localStorage.getItem('nailuxe_last_read_chat') || new Date(0).toISOString()
  }, [])

  const [lastRead, setLastRead] = useState<string>(getLastReadTime)

  // Query unread messages from staff_notes
  const { data: unreadData = { count: 0, latestSender: '', latestMessage: '', latestCreatedAt: '' } } = useQuery({
    queryKey: ['chat_unread_status', currentAdmin?.id, lastRead],
    queryFn: async () => {
      if (!currentAdmin?.id) return { count: 0, latestSender: '', latestMessage: '', latestCreatedAt: '' }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // Admin receives messages where sender_role != 'admin' (from staff)
      // Staff receives messages where sender_role == 'admin' AND staff_id == staff.id
      let query = db
        .from('staff_notes')
        .select('id, staff_id, sender_id, sender_role, message, voice_url, created_at, staff:staff_id(name)')
        .gt('created_at', lastRead)
        .order('created_at', { ascending: false })

      if (isAdmin) {
        query = query.neq('sender_role', 'admin')
      } else {
        query = query.eq('staff_id', currentAdmin.id).eq('sender_role', 'admin')
      }

      const { data, error } = await query

      if (error || !data) return { count: 0, latestSender: '', latestMessage: '', latestCreatedAt: '' }

      const count = data.length
      const latest = data[0]
      const senderName = latest?.staff?.name || 'Staff'
      const msgSnippet = latest?.message || (latest?.voice_url ? '🎤 Voice note' : 'New message')

      return {
        count,
        latestSender: senderName,
        latestMessage: msgSnippet,
        latestCreatedAt: latest?.created_at || '',
      }
    },
    enabled: !!currentAdmin?.id,
    refetchInterval: 3500, // Light poll every 3.5s
  })

  // When a newer message appears in the query while chat is closed
  useEffect(() => {
    if (!unreadData.latestCreatedAt) return

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      lastKnownMaxCreatedRef.current = unreadData.latestCreatedAt
      return
    }

    if (
      unreadData.count > 0 &&
      unreadData.latestCreatedAt !== lastKnownMaxCreatedRef.current &&
      !isChatOpen
    ) {
      lastKnownMaxCreatedRef.current = unreadData.latestCreatedAt
      playNotificationChime()
      toast(`💬 ${toTitleCase(unreadData.latestSender)}: "${unreadData.latestMessage}"`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#21005D',
          color: '#ffffff',
          fontWeight: '600',
          fontSize: '13px',
          borderRadius: '12px',
          border: '1px solid #7F67BE',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        },
      })
    }
  }, [unreadData, isChatOpen])

  // Clear unread badge when chat is opened
  useEffect(() => {
    if (isChatOpen) {
      const nowStr = new Date().toISOString()
      localStorage.setItem('nailuxe_last_read_chat', nowStr)
      setLastRead(nowStr)
      qc.invalidateQueries({ queryKey: ['chat_unread_status'] })
    }
  }, [isChatOpen, qc])

  // Listen to postgres realtime as well for instant delivery
  useEffect(() => {
    if (!currentAdmin) return

    const channelId = `staff_notes_rt_${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_notes' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newNote = payload.new
          if (newNote.sender_id === currentAdmin.id) return

          qc.invalidateQueries({ queryKey: ['chat_unread_status'] })
          qc.invalidateQueries({ queryKey: ['staff_notes', newNote.staff_id] })

          if (!isChatOpen) {
            playNotificationChime()
            toast(`💬 New message received!`, {
              duration: 4000,
              position: 'top-right',
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentAdmin, isChatOpen, qc])

  return {
    hasUnread: unreadData.count > 0 && !isChatOpen,
    unreadCount: isChatOpen ? 0 : unreadData.count,
  }
}
