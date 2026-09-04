import { differenceInMinutes, parseISO } from 'date-fns'

// A single real check-in → check-out cycle, from public.attendance_sessions.
// A day can have any number of these (arriving, a lunch break, coming back);
// pay and overtime are based on their combined duration, not on how many
// there were or on a single check_in/check_out pair.
export interface AttendanceSession {
  staff_id: string
  date: string
  check_in: string
  check_out: string | null
}

/**
 * Total minutes worked across a set of sessions (already filtered to one
 * staff member / one day, or however the caller wants them grouped). An
 * open session (no check_out yet) counts up to `now`.
 */
export function totalWorkedMinutes(sessions: AttendanceSession[], now: Date = new Date()): number {
  return sessions.reduce((sum, s) => {
    if (!s.check_in) return sum
    const end = s.check_out ? parseISO(s.check_out) : now
    return sum + Math.max(0, differenceInMinutes(end, parseISO(s.check_in)))
  }, 0)
}

/** Groups sessions by `${staff_id}__${date}` for per-day aggregation. */
export function groupSessionsByStaffDate(sessions: AttendanceSession[]): Record<string, AttendanceSession[]> {
  const map: Record<string, AttendanceSession[]> = {}
  for (const s of sessions) {
    const key = `${s.staff_id}__${s.date}`
    if (!map[key]) map[key] = []
    map[key].push(s)
  }
  return map
}
