import { useState, useRef, useEffect } from 'react'
import {
  X, Settings, Camera, Bell, Download, RefreshCw, CheckCircle2, ShieldCheck, MapPin, Mic, Loader2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppUpdate } from '../../hooks/useAppUpdate'
import { uploadToCloudinary } from '../../lib/cloudinary'
import { supabase } from '../../lib/supabase'
import { CURRENT_APP_VERSION } from '../../config/appVersion'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { Geolocation } from '@capacitor/geolocation'
import { initPushNotifications, dispatchPushNotification } from '../../lib/pushNotifications'
import toast from 'react-hot-toast'

interface StaffSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function StaffSettingsModal({ isOpen, onClose }: StaffSettingsModalProps) {
  const { staff, refreshStaff } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [sendingTestPush, setSendingTestPush] = useState(false)
  const [refreshingFcm, setRefreshingFcm] = useState(false)
  const [requestingPerms, setRequestingPerms] = useState(false)

  // Permissions state
  const [pushStatus, setPushStatus] = useState<'granted' | 'prompt' | 'denied'>('prompt')
  const [locStatus, setLocStatus] = useState<'granted' | 'prompt' | 'denied'>('prompt')
  const [micStatus, setMicStatus] = useState<'granted' | 'prompt' | 'denied'>('prompt')

  const { hasUpdate, latestVersion, releaseNotes, checkUpdates, checking, downloadAndInstall } = useAppUpdate()

  useEffect(() => {
    if (!isOpen) return
    checkPermissionsStatus()
  }, [isOpen])

  const checkPermissionsStatus = async () => {
    if (!Capacitor.isNativePlatform()) return

    try {
      const p = await PushNotifications.checkPermissions()
      setPushStatus(p.receive === 'granted' ? 'granted' : 'prompt')
    } catch {
      // ignore
    }

    try {
      const l = await Geolocation.checkPermissions()
      setLocStatus(l.location === 'granted' ? 'granted' : 'prompt')
    } catch {
      // ignore
    }

    if (navigator.permissions && (navigator.permissions as any).query) {
      try {
        const m = await (navigator.permissions as any).query({ name: 'microphone' })
        setMicStatus(m.state)
      } catch {
        // ignore
      }
    }
  }

  if (!isOpen || !staff) return null

  // 1. Profile photo change
  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    const toastId = toast.loading('Uploading profile picture…')
    try {
      const result = await uploadToCloudinary(file, 'nailuxe/staff-avatars')
      const { error } = await (supabase as any)
        .from('staff')
        .update({ avatar_url: result.secure_url })
        .eq('id', staff.id)

      if (error) throw error

      await refreshStaff()
      toast.success('Profile picture updated!', { id: toastId })
    } catch (err: any) {
      toast.error('Failed to update picture: ' + err.message, { id: toastId })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 2. Push Notification Test
  const handleTestNotification = async () => {
    setSendingTestPush(true)
    toast.success('Test alert scheduled for 3s! Lock your phone or exit app now.', { duration: 4000 })

    setTimeout(async () => {
      try {
        await dispatchPushNotification({
          targetStaffId: staff.id,
          title: '🔔 Staff Notification',
          body: 'Test notification arrived successfully even when app is closed!',
          data: { isTest: 'true', action: 'chat' },
        })
        toast.success('Background test push sent!')
      } catch (err: any) {
        toast.error('Failed: ' + err.message)
      } finally {
        setSendingTestPush(false)
      }
    }, 3000)
  }

  // 3. Re-request all permissions
  const handleRequestAllPermissions = async () => {
    setRequestingPerms(true)
    try {
      try {
        const p = await PushNotifications.requestPermissions()
        setPushStatus(p.receive === 'granted' ? 'granted' : 'denied')
        if (p.receive === 'granted') {
          await initPushNotifications(staff.id)
        }
      } catch (err) {
        console.warn('Push request error:', err)
      }

      try {
        const l = await Geolocation.requestPermissions()
        setLocStatus(l.location === 'granted' ? 'granted' : 'denied')
      } catch (err) {
        console.warn('Location request error:', err)
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
        setMicStatus('granted')
      } catch (err) {
        console.warn('Mic request error:', err)
      }

      toast.success('Permissions checked and updated!')
    } catch (err: any) {
      toast.error('Error requesting permissions: ' + err.message)
    } finally {
      setRequestingPerms(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-[#1D192B] rounded-3xl p-5 shadow-2xl border border-[#E8DEF8] dark:border-[#382E48] max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#F3EDF7] dark:border-[#2B2930]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] flex items-center justify-center">
              <Settings size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Account & App Settings</h3>
              <p className="text-[11px] text-[#79747E] dark:text-[#938F99]">{staff.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#79747E] dark:text-[#938F99] transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Section 1: Change Profile Photo */}
        <div className="p-3.5 rounded-2xl bg-[#FEF7FF] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] flex items-center gap-3.5">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#EADDFF] dark:bg-[#4F378B] flex items-center justify-center shadow-sm">
              {staff.avatar_url ? (
                <img src={staff.avatar_url} alt={staff.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-[#21005D] dark:text-[#EADDFF]">{staff.name.charAt(0)}</span>
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={18} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Profile Picture</h4>
            <p className="text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5">Change your avatar visible to clients & team</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="mt-1.5 text-xs font-semibold text-[#6750A4] dark:text-[#D0BCFF] flex items-center gap-1 hover:underline cursor-pointer"
            >
              {uploadingAvatar ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              <span>{uploadingAvatar ? 'Uploading…' : 'Upload New Photo'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
            />
          </div>
        </div>

        {/* Section 2: App Version & Updates */}
        <div className="p-3.5 rounded-2xl bg-[#FEF7FF] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download size={16} className="text-[#6750A4] dark:text-[#D0BCFF]" />
              <span className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">App Version</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#6750A4]/15 text-[#6750A4] dark:text-[#D0BCFF] font-bold">
              v{CURRENT_APP_VERSION}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-[#79747E] dark:text-[#938F99]">
              {hasUpdate ? (
                <strong className="text-amber-500 flex items-center gap-1">
                  ⚠️ Update v{latestVersion} Available!
                </strong>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} /> App is up to date
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => checkUpdates()}
              disabled={checking}
              className="py-1 px-2.5 rounded-lg border border-[#CAC4D0] dark:border-[#44474F] text-[11px] font-semibold text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-1 cursor-pointer hover:bg-black/5"
            >
              <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
              <span>{checking ? 'Checking…' : 'Check Updates'}</span>
            </button>
          </div>

          {hasUpdate && (
            <button
              type="button"
              onClick={() => downloadAndInstall()}
              className="w-full mt-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-[#6750A4] to-[#9C6ADE] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
            >
              <Download size={14} />
              <span>Download & Install v{latestVersion}</span>
            </button>
          )}
        </div>

        {/* Section 3: Push Notifications (Google Play Services) */}
        <div className="p-3.5 rounded-2xl bg-[#FEF7FF] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-[#6750A4] dark:text-[#D0BCFF]" />
              <span className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Push Notifications</span>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={11} />
              {Capacitor.isNativePlatform() ? 'FCM Active' : 'Web Mode'}
            </span>
          </div>
          <p className="text-[11px] text-[#79747E] dark:text-[#938F99] leading-snug">
            Google Firebase Cloud Messaging rings and vibrates even when the app is completely closed.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleTestNotification}
              disabled={sendingTestPush}
              className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#6750A4] text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              <Bell size={12} />
              <span>{sendingTestPush ? 'Queued (3s)...' : 'Test Background Alert'}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                setRefreshingFcm(true)
                await initPushNotifications(staff.id)
                setRefreshingFcm(false)
                toast.success('FCM token re-synced!')
              }}
              disabled={refreshingFcm}
              className="py-1.5 px-2.5 rounded-xl bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] text-xs font-semibold text-[#1D1A22] dark:text-[#E6E0E9] flex items-center justify-center gap-1 active:scale-95 transition cursor-pointer"
            >
              <RefreshCw size={12} className={refreshingFcm ? 'animate-spin' : ''} />
              <span>Re-sync</span>
            </button>
          </div>
        </div>

        {/* Section 4: Device Permissions Status & Grant */}
        <div className="p-3.5 rounded-2xl bg-[#FEF7FF] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#6750A4] dark:text-[#D0BCFF]" />
              <span className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">App Permissions</span>
            </div>
            <span className="text-[10px] text-[#79747E] dark:text-[#938F99]">Android System</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]">
              <Bell size={14} className="mx-auto mb-1 text-[#6750A4] dark:text-[#D0BCFF]" />
              <div className="text-[10px] font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Alerts</div>
              <div className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {pushStatus === 'granted' ? 'Allowed' : 'Prompt'}
              </div>
            </div>

            <div className="p-2 rounded-xl bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]">
              <MapPin size={14} className="mx-auto mb-1 text-blue-500" />
              <div className="text-[10px] font-bold text-[#1D1A22] dark:text-[#E6E0E9]">GPS</div>
              <div className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {locStatus === 'granted' ? 'Allowed' : 'Prompt'}
              </div>
            </div>

            <div className="p-2 rounded-xl bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]">
              <Mic size={14} className="mx-auto mb-1 text-rose-500" />
              <div className="text-[10px] font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Voice Mic</div>
              <div className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {micStatus === 'granted' ? 'Allowed' : 'Prompt'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestAllPermissions}
            disabled={requestingPerms}
            className="w-full py-2 px-3 rounded-xl bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] text-xs font-semibold text-[#1D1A22] dark:text-[#E6E0E9] flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
          >
            <ShieldCheck size={13} />
            <span>{requestingPerms ? 'Checking…' : 'Grant / Verify All Permissions'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
