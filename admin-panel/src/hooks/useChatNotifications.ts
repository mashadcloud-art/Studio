import { useEffect, useState, useRef, useCallback } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { toTitleCase } from '../lib/utils'
import { triggerNativeNotification } from '../lib/nativeNotifications'
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
  const { staff: currentAdmin, actualStaff, isAdmin, isImpersonating } = useAuth()
  const effectiveAdmin = isAdmin && !isImpersonating
  const qc = useQueryClient()
  const lastKnownMaxCreatedRef = useRef<string | null>(null)
  const isFirstMountRef = useRef(true)

  const getLastReadTime = useCallback(() => {
    return localStorage.getItem('nailuxe_last_read_chat') || new Date(0).toISOString()
  }, [])

  const [lastRead, setLastRead] = useState<string>(getLastReadTime)

  // Query unread messages from staff_notes
  const { data: unreadData = { count: 0, latestSender: '', latestMessage: '', latestCreatedAt: '', latestSenderRole: '' } } = useQuery({
    queryKey: ['chat_unread_status', currentAdmin?.id, lastRead, effectiveAdmin],
    queryFn: async () => {
      if (!currentAdmin?.id) return { count: 0, latestSender: '', latestMessage: '', latestCreatedAt: '', latestSenderRole: '' }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // Admin receives messages where sender_role != 'admin' (from staff)
      // Staff receives messages where sender_role == 'admin' AND staff_id == currentAdmin.id
      let query = db
        .from('staff_notes')
        .select('id, staff_id, sender_id, sender_role, message, voice_url, created_at, staff:staff_id(name)')
        .gt('created_at', lastRead)
        .order('created_at', { ascending: false })

      if (effectiveAdmin) {
        query = query.neq('sender_role', 'admin')
      } else {
        query = query.eq('staff_id', currentAdmin.id).eq('sender_role', 'admin')
      }

      const { data, error } = await query

      if (error || !data) return { count: 0, latestSender: '', latestMessage: '', latestCreatedAt: '', latestSenderRole: '' }

      // STRICT FILTER:
      // 1. NEVER include own messages (sender_id == currentAdmin.id or actualStaff.id)
      // 2. If effectiveAdmin: NEVER include any message from an admin (sender_role == 'admin')
      // 3. If not admin (staff): NEVER include messages not meant for this staff
      const validMessages = data.filter((msg: any) => {
        if (msg.sender_id === currentAdmin.id) return false
        if (actualStaff && msg.sender_id === actualStaff.id) return false
        if (effectiveAdmin && msg.sender_role === 'admin') return false
        if (!effectiveAdmin && (msg.staff_id !== currentAdmin.id || msg.sender_role !== 'admin')) return false
        return true
      })

      const count = validMessages.length
      const latest = validMessages[0]
      const senderName = latest?.staff?.name || 'Staff'
      const msgSnippet = latest?.message || (latest?.voice_url ? '🎤 Voice note' : 'New message')

      return {
        count,
        latestSender: senderName,
        latestMessage: msgSnippet,
        latestCreatedAt: latest?.created_at || '',
        latestSenderRole: latest?.sender_role || '',
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
      // Guard: Never notify admin if the latest message was sent by an admin
      if (effectiveAdmin && unreadData.latestSenderRole === 'admin') return

      lastKnownMaxCreatedRef.current = unreadData.latestCreatedAt
      playNotificationChime()
      const sender = toTitleCase(unreadData.latestSender)
      triggerNativeNotification({
        title: `💬 ${sender}`,
        body: unreadData.latestMessage || 'Sent a new message',
        action: 'chat',
      })
      toast(`💬 ${sender}: "${unreadData.latestMessage}"`, {
        id: 'chat_message_toast',
        duration: 5000,
        position: 'top-center',
        style: {
          background: '#21005D',
          color: '#ffffff',
          fontWeight: '600',
          fontSize: '13px',
          borderRadius: '16px',
          border: '1px solid #7F67BE',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
        },
      })
    }
  }, [unreadData, isChatOpen, effectiveAdmin])

  // Clear unread badge when chat is opened
  useEffect(() => {
    if (isChatOpen) {
      const nowStr = new Date().toISOString()
      localStorage.setItem('nailuxe_last_read_chat', nowStr)
      setLastRead(nowStr)
      qc.invalidateQueries({ queryKey: ['chat_unread_status'] })
    }
  }, [isChatOpen, qc])

  // Listen to postgres realtime directly for instant delivery even when minimized
  useEffect(() => {
    if (!currentAdmin) return

    const channelId = `staff_notes_rt_${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_notes' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (payload: any) => {
          const newNote = payload.new
          if (!newNote) return

          // 1. NEVER notify sender of their own message!
          if (newNote.sender_id === currentAdmin.id) return
          if (actualStaff && newNote.sender_id === actualStaff.id) return

          // 2. If I am admin: NEVER notify about messages sent by an admin! (No admin to admin messages)
          if (effectiveAdmin && newNote.sender_role === 'admin') return

          // 3. If I am staff: only notify if the note is in my thread AND sent by admin
          if (!effectiveAdmin) {
            if (newNote.staff_id !== currentAdmin.id) return
            if (newNote.sender_role !== 'admin') return
          }

          if (!isChatOpen) {
            lastKnownMaxCreatedRef.current = newNote.created_at
            playNotificationChime()

            // Fetch sender name if possible
            let senderName = newNote.sender_role === 'admin' ? 'Owner / Admin' : 'Staff'
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: senderStaff } = await (supabase as any)
                .from('staff')
                .select('name')
                .eq('id', newNote.sender_id)
                .single()
              if (senderStaff?.name) senderName = toTitleCase(senderStaff.name)
            } catch {
              // fallback to senderName
            }

            const messageSnippet = newNote.message || (newNote.voice_url ? '🎤 Voice note' : 'New message')

            // Trigger instant native Android heads-up notification (works minimized!)
            triggerNativeNotification({
              title: `💬 ${senderName}`,
              body: messageSnippet,
              action: 'chat',
            })
          }

          qc.invalidateQueries({ queryKey: ['chat_unread_status'] })
          qc.invalidateQueries({ queryKey: ['staff_notes', newNote.staff_id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentAdmin, actualStaff, effectiveAdmin, isChatOpen, qc])

  return {
    hasUnread: unreadData.count > 0 && !isChatOpen,
    unreadCount: isChatOpen ? 0 : unreadData.count,
  }
}
