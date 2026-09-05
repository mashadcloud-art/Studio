import { useState, useEffect, useRef } from 'react'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { MapPin, Clock, CheckCircle2, AlertCircle, Navigation, LogIn, LogOut, Zap, Pencil } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import { getTodayString } from '../../lib/utils'
import { useRaiseOvertimePending, useRequestOvertimeReminder } from '../../hooks/useNotifications'
import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Haversine distance (meters) ───────────────────────────────────────────
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// The DAY record — one per staff per date. check_in/check_out here mirror
// whichever session is most recent (null check_out = currently on duty), so
// every other screen that asks "is she online right now" (Team page, chat,
// her own profile badge) keeps working unchanged. It's NOT the source of
// truth for hours worked any more — that's the sum of her actual sessions
// below, since a day can now hold more than one check-in/check-out pair.
interface AttendanceDay {
  id: string
  check_in: string | null
  check_out: string | null
  status: string
  location_verified: boolean
  ot_status?: 'none' | 'pending' | 'approved' | 'rejected'
}

// One real check-in → check-out cycle. A day can have any number of these —
// arriving, leaving for lunch, coming back — and pay is based on their total
// duration, not on how many of them there were.
interface AttendanceSession {
  id: string
  check_in: string
  check_out: string | null
  location_verified: boolean
}

// A session left open from a PREVIOUS day (forgot to check out and it's now
// tomorrow or later) — kept separate from `date` so it can be closed against
// the day it actually belongs to, not whatever "today" happens to be now.
interface StaleSession extends AttendanceSession {
  date: string
}

// ── Reverse geocode (city name) ────────────────────────────────────────────
async function getCityName(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    const addr = data.address
    return addr.suburb ?? addr.city_district ?? addr.town ?? addr.city ?? addr.county ?? addr.state ?? 'Unknown location'
  } catch {
    return 'Location detected'
  }
}

// ── Elapsed timer ──────────────────────────────────────────────────────────
function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function useElapsed(from: string | null) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!from) { setElapsed(0); return }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(from).getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [from])
  return elapsed
}

// Sum of every completed session's duration, in seconds.
function completedSecondsOf(sessions: AttendanceSession[]): number {
  return sessions.reduce((sum, s) => {
    if (!s.check_out) return sum
    return sum + Math.max(0, differenceInMinutes(parseISO(s.check_out), parseISO(s.check_in)) * 60)
  }, 0)
}

export function CheckIn() {
  const { staff } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const c = {
    border: isDark ? '#382E48' : '#E8DEF8',
    surface: isDark ? '#1D192B' : 'white',
    surfaceVariant: isDark ? '#2B2930' : '#F3EDF7',
    text: isDark ? '#E6E0E9' : '#1D1A22',
    muted: isDark ? '#CAC4D0' : '#79747E',
    muted2: isDark ? '#CAC4D0' : '#938F99',
    primary: isDark ? '#D0BCFF' : '#6750A4',
    onPrimary: isDark ? '#381E72' : 'white',
    successBg: isDark ? '#003913' : '#f0fdf4',
    successBorder: isDark ? 'rgba(121,223,132,0.3)' : '#bbf7d0',
    successText: isDark ? '#79DF84' : '#16a34a',
    infoBg: isDark ? '#003355' : '#eff6ff',
    infoText: isDark ? '#9CB4CC' : '#2563eb',
    warningBg: isDark ? '#3D2E00' : '#fffbeb',
    warningBorder: isDark ? 'rgba(251,192,45,0.3)' : '#fde68a',
    warningText: isDark ? '#FBC02D' : '#d97706',
  }
  const [day, setDay] = useState<AttendanceDay | null>(null)
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [staleSession, setStaleSession] = useState<StaleSession | null>(null)
  const [showStaleModal, setShowStaleModal] = useState(false)
  const [staleTime, setStaleTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [cityName, setCityName] = useState<string>('')
  const [studioLocation, setStudioLocation] = useState({ lat: 11.2588, lng: 75.7804, radius: 100 })
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotTime, setForgotTime] = useState('')
  const [stdHours, setStdHours] = useState(8)
  const otRaisedRef = useRef<string | null>(null)
  const raiseOvertimePending = useRaiseOvertimePending()
  const requestOvertimeReminder = useRequestOvertimeReminder()
  const [reminderSent, setReminderSent] = useState(false)
  const today = getTodayString()

  const openSession = sessions.find(s => !s.check_out) ?? null
  const isCheckedIn = !!openSession
  const liveSeconds = useElapsed(openSession?.check_in ?? null)
  const completedSeconds = completedSecondsOf(sessions)
  const cumulativeSeconds = completedSeconds + (isCheckedIn ? liveSeconds : 0)

  // Load studio settings + today's day record + today's sessions
  useEffect(() => {
    const load = async () => {
      if (!staff) return
      setLoading(true)

      const { data: settings } = await db.from('settings').select('key, value')
        .in('key', ['studio_lat', 'studio_lng', 'location_radius_meters', 'standard_work_hours'])
      if (settings) {
        const map: Record<string, string> = {}
        settings.forEach((s: { key: string; value: string }) => { map[s.key] = s.value })
        setStudioLocation({
          lat: parseFloat(map['studio_lat'] ?? '11.2588'),
          lng: parseFloat(map['studio_lng'] ?? '75.7804'),
          radius: parseFloat(map['location_radius_meters'] ?? '100'),
        })
        setStdHours(parseFloat(map['standard_work_hours'] ?? '8'))
      }

      const { data: dayData } = await db.from('attendance').select('*')
        .eq('staff_id', staff.id).eq('date', today).maybeSingle()
      setDay(dayData)

      const { data: sessionData } = await db.from('attendance_sessions').select('*')
        .eq('staff_id', staff.id).eq('date', today).order('check_in', { ascending: true })
      setSessions(sessionData ?? [])

      // Anything still open from a day before today means she checked in and
      // the date rolled over before she checked out — today's own query above
      // would never surface it (wrong date), so it's fetched separately here
      // and closed against the day it actually belongs to.
      const { data: staleData } = await db.from('attendance_sessions').select('*')
        .eq('staff_id', staff.id).is('check_out', null).lt('date', today)
        .order('date', { ascending: false }).limit(1).maybeSingle()
      setStaleSession(staleData ?? null)

      setLoading(false)
    }
    load()
  }, [staff?.id])

  // The moment cumulative time across ALL of today's sessions first crosses the
  // standard-hours threshold while still checked in, flag the day as pending
  // overtime and notify admin/receptionist. Guarded so it only fires once per
  // attendance day, no matter how many separate sessions it took to get there.
  useEffect(() => {
    if (!day?.id || !isCheckedIn || !staff) return
    if (day.ot_status && day.ot_status !== 'none') return
    if (otRaisedRef.current === day.id) return
    if (cumulativeSeconds < stdHours * 3600) return

    otRaisedRef.current = day.id
    raiseOvertimePending.mutate({
      attendanceId: day.id,
      staffId: staff.id,
      staffName: staff.name,
      date: today,
    })
    setDay(d => (d ? { ...d, ot_status: 'pending' } : d))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumulativeSeconds, stdHours, day?.id, isCheckedIn, day?.ot_status])

  // Light poll so an admin's approve/reject elsewhere shows up here without a
  // refresh — keeps checking as long as a day is pending, whether or not
  // she's still checked in, since an approval can land after she's left.
  useEffect(() => {
    if (!day?.id || day.ot_status !== 'pending') return
    const id = setInterval(async () => {
      const { data } = await db.from('attendance').select('ot_status').eq('id', day.id).maybeSingle()
      if (data?.ot_status) setDay(d => (d ? { ...d, ot_status: data.ot_status } : d))
    }, 20000)
    return () => clearInterval(id)
  }, [day?.id, day?.ot_status])

  useEffect(() => {
    setReminderSent(false)
  }, [day?.id])

  // Get GPS location with native Android permission support
  const getLocation = async (): Promise<{ coords: { latitude: number; longitude: number; accuracy: number } }> => {
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.checkPermissions()
        if (perm.location !== 'granted') {
          const req = await Geolocation.requestPermissions()
          if (req.location !== 'granted') {
            throw new Error('Location permission denied. Please allow Location in Android Settings > Apps > Nailuxe Studio.')
          }
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        })
        return pos
      } catch (err: unknown) {
        console.warn('Native GPS error, falling back to browser API:', err)
        // Fall back to navigator.geolocation if plugin encounters an issue
      }
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS is not available on this device'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, (err) => {
        if (err.code === 1) {
          reject(new Error('Location access was denied. Please allow location access in your phone settings.'))
        } else if (err.code === 2) {
          reject(new Error('GPS signal unavailable. Please ensure location/GPS is turned ON.'))
        } else {
          reject(new Error('GPS timeout. Please check your phone location.'))
        }
      }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      })
    })
  }

  const fetchAndVerifyLocation = async () => {
    setGpsLoading(true)
    try {
      const pos = await getLocation()
      const { latitude, longitude, accuracy } = pos.coords
      setLocation({ lat: latitude, lng: longitude, accuracy })
      const dist = getDistanceMeters(latitude, longitude, studioLocation.lat, studioLocation.lng)
      setDistance(Math.round(dist))
      getCityName(latitude, longitude).then(city => setCityName(city))
      return { lat: latitude, lng: longitude, accuracy, dist, verified: dist <= studioLocation.radius }
    } catch (e: unknown) {
      toast.error(`${(e as Error).message}`, { duration: 5000 })
      return null
    } finally {
      setGpsLoading(false)
    }
  }

  // Starts a brand new session — works whether this is her first check-in of
  // the day or she's back from a break after already checking out once.
  const handleCheckIn = async () => {
    if (!staff) return
    if (staleSession) { toast.error('Close out your unfinished shift below first'); return }
    setLoading(true)
    try {
      const loc = await fetchAndVerifyLocation()
      const now = new Date().toISOString()

      if (loc && !loc.verified) {
        const confirmed = window.confirm(
          `⚠️ You are ${loc.dist}m away from the studio (allowed: ${studioLocation.radius}m).\n\nAre you sure you want to check in from this location?`
        )
        if (!confirmed) { setLoading(false); return }
      }

      const { data: session, error } = await db.from('attendance_sessions').insert({
        staff_id: staff.id, date: today, check_in: now,
        check_in_lat: loc?.lat ?? null, check_in_lng: loc?.lng ?? null,
        location_verified: !!loc?.verified,
      }).select().single()
      if (error) throw error
      setSessions(s => [...s, session])

      // Mirror onto the day record so "who's online" everywhere else in the
      // app (Team page, chat, her own profile badge) keeps working — it just
      // reads check_in set / check_out null as "currently checked in".
      const { data: dayData, error: dayErr } = await db.from('attendance').upsert({
        staff_id: staff.id, date: today, status: day?.status ?? 'present',
        check_in: now, check_out: null,
      }, { onConflict: 'staff_id,date' }).select().single()
      if (dayErr) throw dayErr
      setDay(dayData)

      if (loc?.verified) {
        toast.success(`✅ Checked in at ${format(new Date(), 'HH:mm')} — Location verified`)
      } else if (loc) {
        toast(`⚠️ Checked in — ${loc.dist}m from studio (outside range)`, { icon: '📍' })
      } else {
        toast('Checked in (GPS unavailable — location not verified)', { icon: '⚠️' })
      }
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
    setLoading(false)
  }

  // Ends the currently open session. `overrideTime` is used for "forgot to
  // check out earlier" — no GPS is captured for a backdated entry.
  const handleCheckOut = async (overrideTime?: string) => {
    if (!staff || !openSession) return
    setLoading(true)
    try {
      let checkOutIso: string
      let lat: number | null = null
      let lng: number | null = null

      if (overrideTime) {
        checkOutIso = `${today}T${overrideTime}:00`
      } else {
        const loc = await fetchAndVerifyLocation()
        checkOutIso = new Date().toISOString()
        if (loc) {
          lat = loc.lat
          lng = loc.lng
          if (!loc.verified) {
            const confirmed = window.confirm(`⚠️ You are ${loc.dist}m away from the studio.\nCheck out anyway?`)
            if (!confirmed) { setLoading(false); return }
          }
        }
      }

      const { data: updatedSession, error } = await db.from('attendance_sessions')
        .update({ check_out: checkOutIso, check_out_lat: lat, check_out_lng: lng })
        .eq('id', openSession.id).select().single()
      if (error) throw error
      setSessions(s => s.map(x => (x.id === updatedSession.id ? updatedSession : x)))

      const { data: dayData, error: dayErr } = await db.from('attendance')
        .update({ check_out: checkOutIso }).eq('staff_id', staff.id).eq('date', today).select().single()
      if (dayErr) throw dayErr
      setDay(dayData)

      const mins = Math.max(0, differenceInMinutes(parseISO(checkOutIso), parseISO(openSession.check_in)))
      const h = Math.floor(mins / 60), m = mins % 60
      toast.success(overrideTime
        ? `Checked out at ${overrideTime} (${h}h ${m}m this session)`
        : `✅ Checked out at ${format(new Date(), 'HH:mm')} — ${h}h ${m}m this session`)

      setShowForgotModal(false)
      setForgotTime('')
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
    setLoading(false)
  }

  // Closes a session left open from an earlier day — written against the day
  // it actually belongs to (`staleSession.date`), never against today, so
  // that day's own hours/pay land correctly instead of on today's.
  const handleCloseStale = async (overrideTime?: string) => {
    if (!staff || !staleSession) return
    setLoading(true)
    try {
      let checkOutIso: string
      let lat: number | null = null
      let lng: number | null = null

      if (overrideTime) {
        checkOutIso = `${staleSession.date}T${overrideTime}:00`
      } else {
        const loc = await fetchAndVerifyLocation()
        checkOutIso = new Date().toISOString()
        if (loc) { lat = loc.lat; lng = loc.lng }
      }

      const { error } = await db.from('attendance_sessions')
        .update({ check_out: checkOutIso, check_out_lat: lat, check_out_lng: lng })
        .eq('id', staleSession.id)
      if (error) throw error

      await db.from('attendance')
        .update({ check_out: checkOutIso })
        .eq('staff_id', staff.id).eq('date', staleSession.date).is('check_out', null)

      toast.success(`Closed out your ${format(parseISO(staleSession.check_in), 'MMM d')} shift`)
      setStaleSession(null)
      setShowStaleModal(false)
      setStaleTime('')
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
    setLoading(false)
  }

  const now = new Date()
  const cumulativeH = Math.floor(cumulativeSeconds / 3600)
  const cumulativeM = Math.floor((cumulativeSeconds % 3600) / 60)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }} className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: '-0.5px' }}>Attendance</h1>
        <p style={{ fontSize: 13, color: c.muted, marginTop: 3 }}>
          {format(now, 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Unfinished shift from an earlier day — must be closed before a new
          check-in is allowed, so hours never land on the wrong day. */}
      {staleSession && (
        <div style={{ borderRadius: 16, padding: 18, background: c.warningBg, border: `1px solid ${c.warningBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <AlertCircle size={16} color={c.warningText} />
            <span style={{ fontSize: 14, fontWeight: 800, color: c.warningText }}>Unfinished shift</span>
          </div>
          <div style={{ fontSize: 13, color: c.text, marginBottom: 14 }}>
            You checked in on {format(parseISO(staleSession.check_in), 'EEE, MMM d')} at {format(parseISO(staleSession.check_in), 'HH:mm')} and never checked out. Close it out below before starting today.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => handleCloseStale()}
              disabled={loading}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: c.warningText, color: 'white', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: loading ? 0.6 : 1 }}>
              Check Out Now
            </button>
            <button
              onClick={() => setShowStaleModal(true)}
              style={{ background: 'none', border: 'none', color: c.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Pencil size={11} /> Enter the actual time I left
            </button>
          </div>
        </div>
      )}

      {/* Manual checkout-time entry for the stale (previous-day) shift */}
      {showStaleModal && staleSession && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowStaleModal(false)} />
          <div style={{ position: 'relative', background: c.surface, borderRadius: 20, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 6 }}>
              What time did you leave on {format(parseISO(staleSession.check_in), 'MMM d')}?
            </div>
            <div style={{ fontSize: 13, color: c.muted, marginBottom: 16 }}>
              This backdates your checkout to that day — no location is captured for it.
            </div>
            <input
              type="time"
              value={staleTime}
              onChange={e => setStaleTime(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 15, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', marginBottom: 20 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowStaleModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${c.border}`, background: c.surface, fontSize: 13, fontWeight: 600, color: c.muted, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!staleTime) { toast.error('Please enter a time'); return }
                  handleCloseStale(staleTime)
                }}
                disabled={loading}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: c.primary, color: c.onPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Saving...' : 'Confirm Checkout Time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Card */}
      <div style={{
        borderRadius: 20, padding: 24, position: 'relative', overflow: 'hidden',
        background: isCheckedIn ? 'linear-gradient(135deg, #381E72 0%, #4F378B 55%, #6750A4 100%)' : sessions.length > 0 ? c.successBg : c.surface,
        border: isCheckedIn ? 'none' : sessions.length > 0 ? `1px solid ${c.successBorder}` : `1px solid ${c.border}`,
      }}>
        {isCheckedIn && (
          <div style={{
            position: 'absolute', top: -60, right: -60, width: 200, height: 200,
            borderRadius: '50%', background: 'rgba(255,255,255,0.04)',
            animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
          }} />
        )}

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: isCheckedIn ? 'rgba(255,255,255,0.5)' : c.muted }}>
                {staff?.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: isCheckedIn ? '#4ade80' : sessions.length > 0 ? c.successText : '#CAC4D0',
                  animation: isCheckedIn ? 'pulse 2s infinite' : 'none'
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: isCheckedIn ? '#4ade80' : sessions.length > 0 ? c.successText : c.muted2 }}>
                  {isCheckedIn ? 'ON DUTY' : sessions.length > 0 ? 'ON BREAK / OFF DUTY' : 'NOT CHECKED IN'}
                </span>
              </div>
            </div>
            <div style={{
              padding: '6px 12px', borderRadius: 99,
              background: isCheckedIn ? 'rgba(255,255,255,0.1)' : sessions.length > 0 ? c.successBg : c.surfaceVariant,
              fontSize: 12, fontWeight: 700,
              color: isCheckedIn ? 'white' : sessions.length > 0 ? c.successText : c.muted
            }}>
              {format(now, 'HH:mm')}
            </div>
          </div>

          {/* Cumulative timer — sum of every session today, ticking live while checked in */}
          {(isCheckedIn || sessions.length > 0) && (
            <div style={{ textAlign: 'center', margin: '20px 0' }}>
              <div style={{
                fontSize: 44, fontWeight: 900, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
                color: isCheckedIn ? 'white' : c.text,
              }}>
                {String(cumulativeH).padStart(2, '0')}h {String(cumulativeM).padStart(2, '0')}m
              </div>
              <div style={{ fontSize: 12, color: isCheckedIn ? 'rgba(255,255,255,0.4)' : c.muted, marginTop: 4 }}>
                total worked today{sessions.length > 1 ? ` · across ${sessions.length} sessions` : ''}
              </div>

              {cumulativeSeconds >= stdHours * 3600 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
                  padding: '6px 14px', borderRadius: 99,
                  background: day?.ot_status === 'approved' ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
                  border: `1px solid ${day?.ot_status === 'approved' ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.35)'}`,
                }}>
                  <Zap size={13} color={day?.ot_status === 'approved' ? '#4ade80' : '#FBC02D'} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: day?.ot_status === 'approved' ? '#4ade80' : '#FBC02D', fontVariantNumeric: 'tabular-nums' }}>
                    Overtime {formatHMS(cumulativeSeconds - stdHours * 3600)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isCheckedIn ? 'rgba(255,255,255,0.6)' : c.muted }}>
                    {day?.ot_status === 'approved' ? '· approved' : '· awaiting approval'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Location status */}
      {location && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          borderRadius: 12, border: '1px solid',
          background: distance !== null && distance <= studioLocation.radius ? c.successBg : c.warningBg,
          borderColor: distance !== null && distance <= studioLocation.radius ? c.successBorder : c.warningBorder,
        }}>
          <Navigation size={16} color={distance !== null && distance <= studioLocation.radius ? c.successText : c.warningText} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
              {distance !== null && distance <= studioLocation.radius
                ? `✅ You are inside the studio${cityName ? ` · ${cityName}` : ''}`
                : `⚠️ ${distance}m from studio${cityName ? ` · ${cityName}` : ''}`}
            </div>
            <div style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>
              📍 {cityName || 'Detecting area...'} · Accuracy: ±{Math.round(location.accuracy)}m · Allowed: {studioLocation.radius}m
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {!isCheckedIn && !loading && !staleSession && (
        <button
          onClick={handleCheckIn}
          disabled={gpsLoading || loading}
          style={{
            width: '100%', padding: '16px', borderRadius: 14, border: 'none',
            background: c.primary, color: c.onPrimary, fontSize: 15, fontWeight: 800,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            opacity: gpsLoading || loading ? 0.6 : 1
          }}>
          {gpsLoading
            ? <div style={{ width: 18, height: 18, border: `2px solid ${isDark ? 'rgba(56,30,114,0.3)' : 'rgba(255,255,255,0.3)'}`, borderTopColor: c.onPrimary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            : <LogIn size={18} />}
          {gpsLoading ? 'Getting location...' : sessions.length > 0 ? 'Check In — Back from Break' : 'Check In — Start Duty'}
        </button>
      )}

      {isCheckedIn && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => handleCheckOut()}
            disabled={loading}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, border: 'none',
              background: '#ef4444', color: 'white', fontSize: 15, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              opacity: loading ? 0.6 : 1,
            }}>
            <LogOut size={18} />
            Check Out
          </button>
          <button
            onClick={() => setShowForgotModal(true)}
            style={{ background: 'none', border: 'none', color: c.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Pencil size={11} /> Forgot to check out earlier? Enter the time
          </button>
        </div>
      )}

      {/* Manual checkout-time entry */}
      {showForgotModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowForgotModal(false)} />
          <div style={{ position: 'relative', background: c.surface, borderRadius: 20, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 6 }}>What time did you actually leave?</div>
            <div style={{ fontSize: 13, color: c.muted, marginBottom: 16 }}>
              This backdates your checkout — no location is captured for it.
            </div>
            <input
              type="time"
              value={forgotTime}
              onChange={e => setForgotTime(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 15, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', marginBottom: 20 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForgotModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${c.border}`, background: c.surface, fontSize: 13, fontWeight: 600, color: c.muted, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!forgotTime) { toast.error('Please enter a time'); return }
                  handleCheckOut(forgotTime)
                }}
                disabled={loading}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: c.primary, color: c.onPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Saving...' : 'Confirm Checkout Time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Today's sessions */}
      {sessions.length > 0 && (
        <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: 14 }}>Today's Sessions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((s, i) => {
              const mins = s.check_out
                ? Math.max(0, differenceInMinutes(parseISO(s.check_out), parseISO(s.check_in)))
                : Math.floor(liveSeconds / 60)
              return (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < sessions.length - 1 ? `1px solid ${c.surfaceVariant}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{format(parseISO(s.check_in), 'HH:mm')}</span>
                    <span style={{ fontSize: 12, color: c.muted }}>→</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: s.check_out ? c.text : c.successText }}>
                      {s.check_out ? format(parseISO(s.check_out), 'HH:mm') : 'now'}
                    </span>
                    {!s.location_verified && (
                      <AlertCircle size={12} color={c.warningText} />
                    )}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.muted }}>
                    {Math.floor(mins / 60)}h {mins % 60}m{!s.check_out ? ' (ongoing)' : ''}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Overtime status + re-request if the admin hasn't approved yet */}
          {cumulativeSeconds >= stdHours * 3600 && day?.ot_status && day.ot_status !== 'none' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 8, borderTop: `1px solid ${c.surfaceVariant}` }}>
              <span style={{ fontSize: 13, color: c.muted }}>Overtime Status</span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: day.ot_status === 'approved' ? c.successText : day.ot_status === 'rejected' ? '#dc2626' : c.warningText,
              }}>
                {day.ot_status === 'approved' ? '✅ Approved' : day.ot_status === 'rejected' ? '❌ Not approved' : '⏳ Awaiting approval'}
              </span>
            </div>
          )}
          {day?.ot_status === 'pending' && (
            <button
              onClick={() => {
                if (!staff || !day) return
                requestOvertimeReminder.mutate({ attendanceId: day.id, staffId: staff.id, staffName: staff.name, date: today })
                setReminderSent(true)
                toast.success('Reminder sent to admin')
              }}
              disabled={requestOvertimeReminder.isPending || reminderSent}
              style={{
                marginTop: 14, width: '100%', padding: '11px', borderRadius: 10,
                border: `1px solid ${c.warningBorder}`, background: c.warningBg,
                color: c.warningText, fontSize: 12.5, fontWeight: 700,
                cursor: reminderSent || requestOvertimeReminder.isPending ? 'default' : 'pointer',
                fontFamily: 'Inter, sans-serif', opacity: reminderSent ? 0.65 : 1,
              }}>
              {reminderSent
                ? '✓ Reminder sent — waiting on admin'
                : requestOvertimeReminder.isPending
                  ? 'Sending...'
                  : 'Remind Admin to Approve Overtime'}
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.surfaceVariant}` }}>
            {sessions.every(s => s.location_verified)
              ? <CheckCircle2 size={12} color={c.successText} />
              : <AlertCircle size={12} color={c.warningText} />}
            <span style={{ fontSize: 11, color: c.muted }}>
              {sessions.every(s => s.location_verified) ? 'All sessions verified at studio' : 'One or more sessions not location-verified'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
