import { useState, useEffect } from 'react'
import { Save, Download, Sparkles, RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
import { CURRENT_APP_VERSION } from '../../config/appVersion'
import { useAppUpdate } from '../../hooks/useAppUpdate'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function SettingsPage() {
  const [studioName, setStudioName] = useState('Nailuxe Studio')
  const [studioPhone, setStudioPhone] = useState('')
  const [studioAddress, setStudioAddress] = useState('')
  const [stdHours, setStdHours] = useState('8')
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('18:00')
  const [studioLat, setStudioLat] = useState('11.2588')
  const [studioLng, setStudioLng] = useState('75.7804')
  const [studioRadius, setStudioRadius] = useState('100')

  // In-app update settings
  const [appLatestVersion, setAppLatestVersion] = useState(CURRENT_APP_VERSION)
  const [appApkUrl, setAppApkUrl] = useState('')
  const [appReleaseNotes, setAppReleaseNotes] = useState('Bug fixes and performance improvements.')
  const [appForceUpdate, setAppForceUpdate] = useState(false)

  const [saving, setSaving] = useState(false)
  const { hasUpdate, latestVersion, checkUpdates, checking, downloadAndInstall } = useAppUpdate()

  // Load existing settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await db.from('settings').select('key, value')
        if (data) {
          data.forEach((row: { key: string; value: string }) => {
            if (row.key === 'studio_name') setStudioName(row.value)
            if (row.key === 'studio_phone') setStudioPhone(row.value)
            if (row.key === 'studio_address') setStudioAddress(row.value)
            if (row.key === 'standard_work_hours') setStdHours(row.value)
            if (row.key === 'work_start_time') setWorkStart(row.value)
            if (row.key === 'work_end_time') setWorkEnd(row.value)
            if (row.key === 'studio_lat') setStudioLat(row.value)
            if (row.key === 'studio_lng') setStudioLng(row.value)
            if (row.key === 'location_radius_meters') setStudioRadius(row.value)
            if (row.key === 'app_latest_version') setAppLatestVersion(row.value)
            if (row.key === 'app_apk_url') setAppApkUrl(row.value)
            if (row.key === 'app_release_notes') setAppReleaseNotes(row.value)
            if (row.key === 'app_force_update') setAppForceUpdate(row.value === 'true')
          })
        }
      } catch (err) {
        console.warn('Failed loading settings:', err)
      }
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const settings = [
        { key: 'studio_name', value: studioName },
        { key: 'studio_phone', value: studioPhone },
        { key: 'studio_address', value: studioAddress },
        { key: 'standard_work_hours', value: stdHours },
        { key: 'work_start_time', value: workStart },
        { key: 'work_end_time', value: workEnd },
        { key: 'studio_lat', value: studioLat },
        { key: 'studio_lng', value: studioLng },
        { key: 'location_radius_meters', value: studioRadius },
        { key: 'app_latest_version', value: appLatestVersion.trim() },
        { key: 'app_apk_url', value: appApkUrl.trim() },
        { key: 'app_release_notes', value: appReleaseNotes.trim() },
        { key: 'app_force_update', value: appForceUpdate ? 'true' : 'false' },
      ]
      for (const s of settings) {
        await db.from('settings').upsert(s, { onConflict: 'key' })
      }
      toast.success('Settings & App Version updated successfully!')
      checkUpdates()
    } catch {
      toast.error('Failed to save settings')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Settings</h1>
        <p className="text-[#49454F] dark:text-[#CAC4D0] text-sm">Configure your studio preferences and app updates</p>
      </div>

      {/* App Version & In-App Updates Card */}
      <Card>
        <CardHeader
          title="App Version & In-App Updates"
          subtitle="Automatic update notifications on mobile phones and staff devices"
        />
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#FEF7FF] dark:bg-[#141218] border border-[#E8DEF8] dark:border-[#382E48] gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[#1D1A22] dark:text-[#E6E0E9]">Installed Version:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#6750A4]/15 text-[#6750A4] dark:text-[#D0BCFF] text-xs font-black">
                  v{CURRENT_APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-1">
                {hasUpdate ? (
                  <span className="text-amber-500 font-semibold flex items-center gap-1">
                    ⚠️ New Update v{latestVersion} Available!
                  </span>
                ) : (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    ✓ You are running the latest version!
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = await checkUpdates()
                  if (!res.hasUpdate) toast.success('You have the latest version! ✨')
                  else toast(`🚀 New version v${res.latestVersion} available!`)
                }}
                loading={checking}
                icon={<RefreshCw size={13} className={checking ? 'animate-spin' : ''} />}
              >
                Check Updates
              </Button>
              {hasUpdate && (
                <Button
                  size="sm"
                  onClick={() => downloadAndInstall()}
                  icon={<Download size={14} />}
                >
                  Download
                </Button>
              )}
            </div>
          </div>

          {/* Admin Publishing Controls */}
          <div className="pt-3 border-t border-[#F3EDF7] dark:border-[#2B2930] space-y-4">
            <h3 className="text-xs font-bold text-[#6750A4] dark:text-[#D0BCFF] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={14} /> Publish New Version to All Phones
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Target Version Number"
                value={appLatestVersion}
                onChange={e => setAppLatestVersion(e.target.value)}
                placeholder="1.0.5"
              />
              <Input
                label="Direct APK Download URL"
                value={appApkUrl}
                onChange={e => setAppApkUrl(e.target.value)}
                placeholder="https://.../Nailuxe-Studio.apk"
              />
            </div>
            <Input
              label="Release Notes (Displayed to users on update popup)"
              value={appReleaseNotes}
              onChange={e => setAppReleaseNotes(e.target.value)}
              placeholder="e.g. Fixed chat input bar, persistent auto-login, and instant background notifications."
            />
            <label className="flex items-center gap-2.5 text-xs text-[#49454F] dark:text-[#CAC4D0] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={appForceUpdate}
                onChange={e => setAppForceUpdate(e.target.checked)}
                className="w-4 h-4 rounded accent-[#6750A4] cursor-pointer"
              />
              <span><strong>Force Update:</strong> Require users to update before continuing into the app</span>
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Studio Information" />
        <div className="space-y-4">
          <Input label="Studio Name" value={studioName} onChange={e => setStudioName(e.target.value)} />
          <Input label="Phone Number" value={studioPhone} onChange={e => setStudioPhone(e.target.value)} />
          <Input label="Address" value={studioAddress} onChange={e => setStudioAddress(e.target.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Working Hours" subtitle="Used for overtime calculation" />
        <div className="space-y-4">
          <Input label="Standard Work Hours per Session" type="number" min="1" max="24"
            value={stdHours} onChange={e => setStdHours(e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Work Start Time" type="time" value={workStart} onChange={e => setWorkStart(e.target.value)} />
            <Input label="Work End Time" type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Studio Location" subtitle="Used for GPS attendance verification" />
        <div className="space-y-4">
          <div className="bg-[#C2E7FF] dark:bg-[#003355] border border-[#A6D4F5] dark:border-[#0B4A75] rounded-2xl p-3 text-xs text-[#001D35] dark:text-[#9CB4CC]">
            📍 Current: <strong>Lat {studioLat}, Lng {studioLng}</strong> · Radius {studioRadius}m
            <br />To update: Google Maps → right-click your studio → copy coordinates
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Latitude" value={studioLat} onChange={e => setStudioLat(e.target.value)} placeholder="11.2588" />
            <Input label="Longitude" value={studioLng} onChange={e => setStudioLng(e.target.value)} placeholder="75.7804" />
            <Input label="Radius (meters)" value={studioRadius} onChange={e => setStudioRadius(e.target.value)} placeholder="100" />
          </div>
        </div>
      </Card>

      <Button icon={<Save size={16} />} onClick={handleSave} loading={saving}>
        Save Settings
      </Button>
    </div>
  )
}
