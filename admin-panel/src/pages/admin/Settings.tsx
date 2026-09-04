import { useState } from 'react'
import { Save } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
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
  const [saving, setSaving] = useState(false)

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
      ]
      for (const s of settings) {
        await db.from('settings').upsert(s, { onConflict: 'key' })
      }
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Settings</h1>
        <p className="text-[#49454F] dark:text-[#CAC4D0] text-sm">Configure your studio preferences</p>
      </div>

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

      <div className="bg-[#EADDFF] dark:bg-[#4F378B] border border-[#D0BCFF]/50 dark:border-[#7F67BE]/50 rounded-2xl p-4 text-sm text-[#21005D] dark:text-[#EADDFF]">
        <p className="font-semibold mb-1">💡 Staff & Receptionist Login</p>
        <p>
          They log in at <strong>localhost:5174</strong> using the email and password you set for them
          on the Team page. Staff see only their own work. Receptionists see bookings and customers.
        </p>
      </div>

      <div className="bg-[#C2E7FF] dark:bg-[#003355] border border-[#A6D4F5] dark:border-[#0B4A75] rounded-2xl p-4 text-sm text-[#001D35] dark:text-[#9CB4CC]">
        <p className="font-semibold mb-1">💡 Supabase Configuration</p>
        <p>
          To create staff users, go to Supabase → Authentication → Users → Invite user.
          Then link their auth UID with the staff record ID in the staff table.
        </p>
      </div>

      <Button icon={<Save size={16} />} onClick={handleSave} loading={saving}>
        Save Settings
      </Button>
    </div>
  )
}
