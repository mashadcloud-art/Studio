import { useState, useEffect } from 'react'
import { Bell, MapPin, Sparkles, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { Geolocation } from '@capacitor/geolocation'
import { initPushNotifications } from '../../lib/pushNotifications'
import toast from 'react-hot-toast'

interface PermissionsModalProps {
  userId?: string
}

export function PermissionsModal({ userId }: PermissionsModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [pushGranted, setPushGranted] = useState(false)
  const [locGranted, setLocGranted] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    async function checkPerms() {
      try {
        const alreadyDismissed = localStorage.getItem('nailuxe_perms_dismissed') === 'true'
        if (alreadyDismissed) return

        let pGranted = false
        let lGranted = false

        // Check Push Notifications
        try {
          const pushStatus = await PushNotifications.checkPermissions()
          pGranted = pushStatus.receive === 'granted'
          setPushGranted(pGranted)
        } catch {
          // ignore
        }

        // Check Geolocation
        try {
          const locStatus = await Geolocation.checkPermissions()
          lGranted = locStatus.location === 'granted'
          setLocGranted(lGranted)
        } catch {
          // ignore
        }

        // If either permission is missing, show prompt
        if (!pGranted || !lGranted) {
          setIsOpen(true)
        }
      } catch (e) {
        console.warn('Error checking permissions:', e)
      }
    }

    checkPerms()
  }, [])

  if (!isOpen) return null

  const handleEnableAll = async () => {
    setRequesting(true)
    try {
      // 1. Request Push Notifications
      try {
        const pushRes = await PushNotifications.requestPermissions()
        if (pushRes.receive === 'granted') {
          setPushGranted(true)
          if (userId) {
            await initPushNotifications(userId)
          }
        }
      } catch (err) {
        console.warn('Push request failed:', err)
      }

      // 2. Request Geolocation
      try {
        const locRes = await Geolocation.requestPermissions()
        if (locRes.location === 'granted') {
          setLocGranted(true)
        }
      } catch (err) {
        console.warn('Location request failed:', err)
      }

      toast.success('Permissions updated successfully!')
      localStorage.setItem('nailuxe_perms_dismissed', 'true')
      setIsOpen(false)
    } catch (err: any) {
      toast.error('Could not complete permission setup: ' + err.message)
    } finally {
      setRequesting(false)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('nailuxe_perms_dismissed', 'true')
    setIsOpen(false)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1D192B] rounded-3xl p-6 shadow-2xl border border-[#E8DEF8] dark:border-[#382E48] space-y-5">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-full text-[#79747E] dark:text-[#938F99] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Icon & Title */}
        <div className="text-center space-y-1.5 pt-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#4F378B] to-[#9C6ADE] text-white flex items-center justify-center shadow-lg">
            <Sparkles size={28} />
          </div>
          <h3 className="text-lg font-black text-[#1D1A22] dark:text-[#E6E0E9] tracking-tight">
            Enable Studio Features
          </h3>
          <p className="text-xs text-[#79747E] dark:text-[#938F99] leading-relaxed px-2">
            To keep you updated on notes and verify attendance at the studio, please allow these permissions:
          </p>
        </div>

        {/* Permission list */}
        <div className="space-y-3">
          {/* Push Notifications */}
          <div className="p-3.5 rounded-2xl bg-[#FEF7FF] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#6750A4]/15 dark:bg-[#D0BCFF]/20 text-[#6750A4] dark:text-[#D0BCFF] flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Push Notifications</span>
                {pushGranted && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Allowed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5 leading-snug">
                Receive instant alerts for notes and client bookings even when the app is completely closed.
              </p>
            </div>
          </div>

          {/* GPS Location */}
          <div className="p-3.5 rounded-2xl bg-[#FEF7FF] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">GPS Attendance</span>
                {locGranted && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Allowed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5 leading-snug">
                Verify check-in and attendance automatically when you arrive at the salon.
              </p>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleEnableAll}
            disabled={requesting}
            className="w-full py-3 px-4 rounded-xl bg-[#6750A4] hover:bg-[#523E85] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck size={16} />
            <span>{requesting ? 'Requesting...' : 'Enable All Permissions'}</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-2 text-xs font-semibold text-[#79747E] dark:text-[#938F99] hover:text-[#1D1A22] dark:hover:text-white transition cursor-pointer"
          >
            Not Now (Ask Later)
          </button>
        </div>
      </div>
    </div>
  )
}
