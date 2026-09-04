import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { totalWorkedMinutes, type AttendanceSession } from '../lib/attendanceHours'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  staff_id: string | null
  attendance_id: string | null
  expense_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  read_by: string[]
  created_at: string
  // Joined so the bell can show current approval state without a second query.
  attendance: { ot_status: 'none' | 'pending' | 'approved' | 'rejected'; ot_reviewed_by: string | null; ot_reviewed_at: string | null } | null
  expense: { id: string; title: string; amount: number; category: string; date: string; edit_approved_until: string | null } | null
  staff: { name: string } | null
}

// Admin/receptionist-only feed — light polling keeps it feeling live without
// needing a websocket subscription (same pattern as useStaffNotes).
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await db
        .from('notifications')
        .select('*, attendance:attendance_id ( ot_status, ot_reviewed_by, ot_reviewed_at ), expense:expense_id ( id, title, amount, category, date, edit_approved_until ), staff:staff_id ( name )')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as AppNotification[]
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  })
}

export function unreadCount(notifications: AppNotification[], userId: string | undefined) {
  if (!userId) return 0
  return notifications.filter(n => !n.read_by.includes(userId)).length
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, userId, currentReadBy }: { id: string; userId: string; currentReadBy: string[] }) => {
      if (currentReadBy.includes(userId)) return
      const { error } = await db
        .from('notifications')
        .update({ read_by: [...currentReadBy, userId] })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ notifications, userId }: { notifications: AppNotification[]; userId: string }) => {
      const unread = notifications.filter(n => !n.read_by.includes(userId))
      for (const n of unread) {
        const { error } = await db.from('notifications').update({ read_by: [...n.read_by, userId] }).eq('id', n.id)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// Approve or reject a pending overtime day. This is what actually decides
// whether it gets paid — it writes straight into the `overtime` table
// (staff_id, date, total_minutes) the moment a decision is made, rather than
// waiting for someone to happen to open the Overtime Report page (that page
// keeps its own sync effect too, as a harmless backup resync for a whole
// month at once, but approvals made from the notification bell must not
// depend on it — otherwise a same-day approval could sit invisible to
// Payroll until someone visits that report).
export function useReviewOvertime() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ attendanceId, status, reviewerId }: { attendanceId: string; status: 'approved' | 'rejected'; reviewerId: string }) => {
      const { error } = await db
        .from('attendance')
        .update({ ot_status: status, ot_reviewed_by: reviewerId, ot_reviewed_at: new Date().toISOString() })
        .eq('id', attendanceId)
      if (error) throw error

      const { data: att, error: attErr } = await db
        .from('attendance')
        .select('staff_id, date')
        .eq('id', attendanceId)
        .maybeSingle()
      if (attErr) throw attErr

      if (att) {
        // A day can hold several real check-in/check-out sessions (arriving, a
        // lunch break, coming back) — overtime is decided by their COMBINED
        // hours, not by the attendance row's own check_in/check_out (those
        // only mirror the most recent session, for "is she online" displays
        // elsewhere — see migration_v14).
        const [{ data: daySessions }, { data: settingRow }] = await Promise.all([
          db.from('attendance_sessions').select('staff_id, date, check_in, check_out')
            .eq('staff_id', att.staff_id).eq('date', att.date),
          db.from('settings').select('value').eq('key', 'standard_work_hours').maybeSingle(),
        ])
        const stdHours = parseFloat(settingRow?.value ?? '8')
        const worked = totalWorkedMinutes((daySessions ?? []) as AttendanceSession[])
        // Rejected (or reversed) days sync as 0 minutes so anything previously
        // approved and now walked back clears out of Payroll too.
        const totalMinutes = status === 'approved' ? Math.max(0, worked - stdHours * 60) : 0
        const { error: otErr } = await db
          .from('overtime')
          .upsert({ staff_id: att.staff_id, date: att.date, total_minutes: totalMinutes }, { onConflict: 'staff_id,date' })
        if (otErr) throw otErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
      qc.invalidateQueries({ queryKey: ['attendance-overtime'] })
      qc.invalidateQueries({ queryKey: ['attendance_for_payroll'] })
      qc.invalidateQueries({ queryKey: ['overtime_for_payroll'] })
    },
  })
}

// Called by CheckIn.tsx the moment a staff member's live session first
// crosses the standard-hours threshold. Idempotent per attendance row: the
// caller only invokes this once (guarded by ot_status !== 'none' already).
export function useRaiseOvertimePending() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ attendanceId, staffId, staffName, date }: { attendanceId: string; staffId: string; staffName: string; date: string }) => {
      const { error: attErr } = await db.from('attendance').update({ ot_status: 'pending' }).eq('id', attendanceId)
      if (attErr) throw attErr
      const { error: notifErr } = await db.from('notifications').insert({
        type: 'overtime_pending',
        title: `${staffName} is now in overtime`,
        body: `Still checked in past the standard shift on ${date}. Approve to count it toward pay.`,
        staff_id: staffId,
        attendance_id: attendanceId,
      })
      if (notifErr) throw notifErr
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// Staff-side nudge for an overtime day that's been sitting unapproved (or was
// rejected and they want it looked at again). Re-raises the same admin
// notification without touching ot_status itself — approval still goes
// through useReviewOvertime above like normal. Called from CheckIn.tsx's
// "Today's Summary" when the admin hasn't acted on a pending day yet.
export function useRequestOvertimeReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ attendanceId, staffId, staffName, date }: { attendanceId: string; staffId: string; staffName: string; date: string }) => {
      const { error } = await db.from('notifications').insert({
        type: 'overtime_pending',
        title: `${staffName} is asking you to review their overtime again`,
        body: `Still waiting on approval for ${date}. Approve or reject it from Approvals.`,
        staff_id: staffId,
        attendance_id: attendanceId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// Called by a receptionist tapping Edit on an expense they don't currently
// have an open approval window for. Raises a notification for admins/
// receptionists to review — editing stays locked until it's approved.
export function useRequestExpenseEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ expenseId, staffId, staffName, expenseTitle, expenseAmount }: {
      expenseId: string; staffId: string; staffName: string; expenseTitle: string; expenseAmount: number
    }) => {
      const { error } = await db.from('notifications').insert({
        type: 'expense_edit_request',
        title: `${staffName} wants to edit an expense`,
        body: `"${expenseTitle}" · ₹${expenseAmount} — approve to open a 30-minute edit window.`,
        staff_id: staffId,
        expense_id: expenseId,
        status: 'pending',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// Admin/receptionist review of an expense-edit request. Approving opens a
// 30-minute window on that specific expense row (checked client-side against
// expenses.edit_approved_until, and enforced at the DB via RLS); rejecting
// just marks the request so the requester sees it was denied.
export function useReviewExpenseEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ notificationId, expenseId, decision, reviewerId }: {
      notificationId: string; expenseId: string; decision: 'approved' | 'rejected'; reviewerId: string
    }) => {
      const { error: notifErr } = await db.from('notifications').update({ status: decision }).eq('id', notificationId)
      if (notifErr) throw notifErr
      if (decision === 'approved') {
        const editApprovedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString()
        const { error: expErr } = await db.from('expenses')
          .update({ edit_approved_by: reviewerId, edit_approved_until: editApprovedUntil })
          .eq('id', expenseId)
        if (expErr) throw expErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}
