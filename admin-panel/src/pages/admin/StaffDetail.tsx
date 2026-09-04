import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Phone, MapPin, Calendar,
  KeyRound, Star, DollarSign, Sparkles, ShieldCheck, UserCog,
  MessageCircle, Loader2, Briefcase, LogIn,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffById, useUpdateStaff, useDeleteStaff } from '../../hooks/useStaff'
import { useStaffMonthlyReport } from '../../hooks/useReports'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { ImageUpload } from '../../components/ui/ImageUpload'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { StaffFormModal } from '../../components/staff/StaffFormModal'
import { formatDate, formatCurrency, toTitleCase } from '../../lib/utils'
import type { Staff } from '../../types/database'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const roleConfig = {
  admin: { color: 'bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF]', icon: ShieldCheck, label: 'Admin' },
  staff: { color: 'bg-[#E8DEF8] dark:bg-[#4A4458] text-[#1D192B] dark:text-[#E8DEF8]', icon: Sparkles, label: 'Staff' },
  receptionist: { color: 'bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0]', icon: UserCog, label: 'Receptionist' },
}

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: staff, isLoading } = useStaffById(id)
  const { loginAsStaff } = useAuth()
  const updateStaff = useUpdateStaff()
  const deleteStaff = useDeleteStaff()

  const [showEditModal, setShowEditModal] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Lightweight teaser for the current month — full detail lives on its own page
  const now = new Date()
  const { data: workReport } = useStaffMonthlyReport(id ?? '', now.getFullYear(), now.getMonth() + 1)
  const distinctClientsThisMonth = new Set((workReport?.records ?? []).map(r => r.customers?.id ?? r.customers?.name)).size

  const handlePasswordReset = async () => {
    if (!staff || newPassword.length < 6) { toast.error('Min 6 characters'); return }
    setResetting(true)
    try {
      const { error } = await db.functions.invoke('reset-staff-password', {
        body: { userId: staff.id, newPassword },
      })
      if (error) throw error
      toast.success(`Password reset for ${staff.name}`)
      setResetOpen(false)
      setNewPassword('')
    } catch (e: unknown) { toast.error((e as Error).message) }
    setResetting(false)
  }

  const handleDelete = async () => {
    if (!staff) return
    try {
      await deleteStaff.mutateAsync(staff.id)
      toast.success('Staff removed')
      navigate('/staff')
    } catch { toast.error('Failed') }
    setConfirmDelete(false)
  }

  const handleToggleActive = async () => {
    if (!staff) return
    await updateStaff.mutateAsync({ id: staff.id, updates: { active: !staff.active } })
    toast.success(`${staff.name} ${!staff.active ? 'activated' : 'deactivated'}`)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[#CAC4D0]" />
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="text-center py-16 text-[#79747E] dark:text-[#938F99] text-sm">
        Team member not found.
        <div className="mt-3">
          <button onClick={() => navigate('/staff')} className="text-[#6750A4] dark:text-[#D0BCFF] font-semibold underline">
            Back to Team
          </button>
        </div>
      </div>
    )
  }

  const rc = roleConfig[staff.role as keyof typeof roleConfig] ?? roleConfig.staff
  const speciality = (staff as Staff & { speciality?: string }).speciality

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/staff')}
        className="flex items-center gap-2 text-sm font-semibold text-[#49454F] dark:text-[#938F99] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9] transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Team
      </button>

      <div className="bg-white dark:bg-[#1D192B] rounded-[28px] border border-[#E8DEF8] dark:border-[#382E48] overflow-hidden shadow-sm">
        {/* Cover + Avatar */}
        <div className="relative h-36 bg-gradient-to-br from-[#6750A4] via-[#7F67BE] to-[#9A82DB]">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}
          />
          {/* Avatar with Cloudinary upload */}
          <div className="absolute -bottom-10 left-6">
            <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg overflow-hidden">
              <ImageUpload
                value={staff.avatar_url}
                onChange={async (url) => {
                  await updateStaff.mutateAsync({ id: staff.id, updates: { avatar_url: url } })
                }}
                folder={`nailuxe/staff/${staff.id}`}
                size="avatar"
                allowCamera={false}
              />
            </div>
          </div>
          {/* Actions top right */}
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={() => { setResetOpen(true); setNewPassword('') }}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-xl text-white transition-colors"
              title="Reset Password"
            >
              <KeyRound size={15} />
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-xl text-white transition-colors"
              title="Edit"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 bg-white/20 hover:bg-red-500/50 rounded-xl text-white transition-colors"
              title="Remove"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="pt-14 px-6 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#1D1A22] dark:text-[#E6E0E9] capitalize">{toTitleCase(staff.name)}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${rc.color}`}>
                  {rc.label}
                </span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const code = (staff as any).staff_code || (
                    staff.name.toUpperCase().includes('NIMISHA') ? 'NLX-01' :
                    staff.name.toUpperCase().includes('REJEENA') ? 'NLX-02' :
                    staff.name.toUpperCase().includes('SANIYA') ? 'NLX-03' :
                    `NLX-${staff.id.slice(0, 4).toUpperCase()}`
                  )
                  return (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-[#6750A4]/10 dark:bg-[#D0BCFF]/10 text-[#6750A4] dark:text-[#D0BCFF] border border-[#6750A4]/20">
                      Code: {code}
                    </span>
                  )
                })()}
                {speciality && (
                  <span className="flex items-center gap-1 text-xs text-[#49454F] dark:text-[#938F99]">
                    <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    {speciality}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleToggleActive}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                staff.active
                  ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 hover:bg-red-50 hover:text-red-600'
                  : 'bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#938F99] hover:bg-green-50 hover:text-green-600'
              }`}
            >
              {staff.active ? '● Active' : '○ Inactive'}
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
            {[
              { label: 'Salary', value: formatCurrency(staff.salary), icon: DollarSign, color: 'text-[#6750A4] dark:text-[#D0BCFF]' },
              { label: 'Joined', value: formatDate(staff.joining_date), icon: Calendar, color: 'text-[#6750A4] dark:text-[#D0BCFF]' },
              { label: 'Role', value: rc.label, icon: Star, color: 'text-[#6750A4] dark:text-[#D0BCFF]' },
            ].map(stat => (
              <div key={stat.label} className="bg-[#F3EDF7] dark:bg-[#2B2930] rounded-xl p-3 text-center">
                <stat.icon size={16} className={`${stat.color} mx-auto mb-1`} />
                <p className="text-xs text-[#79747E] dark:text-[#938F99]">{stat.label}</p>
                <p className="text-sm font-semibold text-[#1D1A22] dark:text-[#E6E0E9] mt-0.5">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Contact */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F3EDF7] dark:bg-[#2B2930]">
              <Phone size={15} className="text-[#79747E] dark:text-[#938F99] shrink-0" />
              <span className="text-sm text-[#49454F] dark:text-[#CAC4D0]">{staff.phone}</span>
            </div>
            {staff.address && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F3EDF7] dark:bg-[#2B2930]">
                <MapPin size={15} className="text-[#79747E] dark:text-[#938F99] shrink-0" />
                <span className="text-sm text-[#49454F] dark:text-[#CAC4D0] capitalize">{toTitleCase(staff.address)}</span>
              </div>
            )}
          </div>

          {/* Speciality badge */}
          {speciality && (
            <div className="mt-4">
              <p className="text-xs text-[#79747E] dark:text-[#938F99] mb-2 font-medium uppercase tracking-wide">Speciality</p>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EADDFF] dark:bg-[#4F378B] border border-[#D0BCFF] dark:border-[#4F378B] rounded-xl text-sm font-medium text-[#21005D] dark:text-[#EADDFF]">
                <Sparkles size={13} />
                {speciality}
              </span>
            </div>
          )}

          {/* Staff Login Credentials Card */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const staffLoginEmail = (staff as any).email || `${staff.name.toLowerCase().replace(/\s+/g, '')}@nailuxe.com`
            const defaultPassword = 'password123'
            return (
              <div className="mt-5 p-4 rounded-2xl border border-[#D0BCFF] dark:border-[#4F378B] bg-gradient-to-br from-[#FEF7FF] to-[#F3EDF7] dark:from-[#1D192B] dark:to-[#2B2930] shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] flex items-center justify-center">
                      <KeyRound size={14} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9] uppercase tracking-wider">
                        Staff Login Credentials
                      </h3>
                      <p className="text-[10px] text-[#79747E] dark:text-[#938F99]">
                        Used by {toTitleCase(staff.name)} to sign in at localhost:5173/login
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setResetOpen(true); setNewPassword('') }}
                    className="text-xs font-bold text-[#6750A4] dark:text-[#D0BCFF] hover:underline flex items-center gap-1"
                  >
                    Change Password ↗
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Username / Email */}
                  <div className="p-3 bg-white dark:bg-[#1D192B] rounded-xl border border-[#E8DEF8] dark:border-[#382E48]">
                    <p className="text-[10px] font-bold text-[#79747E] dark:text-[#938F99] uppercase">Username / Email</p>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <span className="text-xs font-mono font-bold text-[#21005D] dark:text-[#EADDFF] truncate">
                        {staffLoginEmail}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(staffLoginEmail)
                          toast.success('Username copied!')
                        }}
                        title="Copy Username"
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#F3EDF7] dark:bg-[#382E48] text-[#6750A4] dark:text-[#D0BCFF] hover:bg-[#EADDFF] font-semibold shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="p-3 bg-white dark:bg-[#1D192B] rounded-xl border border-[#E8DEF8] dark:border-[#382E48]">
                    <p className="text-[10px] font-bold text-[#79747E] dark:text-[#938F99] uppercase">Password</p>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <span className="text-xs font-mono font-bold text-[#21005D] dark:text-[#EADDFF]">
                        {showPassword ? defaultPassword : '•••••••••••'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-[#F3EDF7] dark:bg-[#382E48] text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#EADDFF] font-semibold"
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(defaultPassword)
                            toast.success('Password copied!')
                          }}
                          title="Copy Password"
                          className="text-[10px] px-2 py-0.5 rounded-md bg-[#F3EDF7] dark:bg-[#382E48] text-[#6750A4] dark:text-[#D0BCFF] hover:bg-[#EADDFF] font-semibold"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Direct Login Button */}
                <button
                  onClick={() => {
                    loginAsStaff(staff)
                    toast.success(`Logged in as ${toTitleCase(staff.name)}!`)
                    if (staff.role === 'receptionist') {
                      navigate('/bookings')
                    } else {
                      navigate('/my-profile')
                    }
                  }}
                  className="w-full mt-2.5 py-2.5 px-4 bg-gradient-to-r from-[#6750A4] to-[#7F67BE] hover:from-[#7F67BE] hover:to-[#6750A4] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <LogIn size={15} />
                  Direct Login as {toTitleCase(staff.name)} ({rc.label} View)
                </button>
              </div>
            )
          })()}

          {/* Chat — its own page */}
          <div className="mt-4 space-y-2">
            <button
              onClick={() => navigate(`/staff/${staff.id}/chat`)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] bg-[#F3EDF7] dark:bg-[#2B2930] hover:bg-[#EADDFF] dark:hover:bg-[#382E48] transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[#49454F] dark:text-[#CAC4D0]">
                <MessageCircle size={15} className="text-[#79747E] dark:text-[#938F99]" />
                Chat with {staff.name.split(' ')[0]}
              </span>
              <span className="text-xs text-[#79747E] dark:text-[#938F99]">Open →</span>
            </button>

            {/* Work log — its own page */}
            <button
              onClick={() => navigate(`/staff/${staff.id}/work`)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] bg-[#F3EDF7] dark:bg-[#2B2930] hover:bg-[#EADDFF] dark:hover:bg-[#382E48] transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[#49454F] dark:text-[#CAC4D0]">
                <Briefcase size={15} className="text-[#79747E] dark:text-[#938F99]" />
                This Month's Work
              </span>
              <span className="text-xs text-[#79747E] dark:text-[#938F99]">
                {formatCurrency(workReport?.totalRevenue ?? 0)} · {distinctClientsThisMonth} client{distinctClientsThisMonth !== 1 ? 's' : ''} · Open →
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <StaffFormModal open={showEditModal} onClose={() => setShowEditModal(false)} editingStaff={staff} />

      {/* Password Reset */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={`Reset Password — ${staff.name}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button onClick={handlePasswordReset} loading={resetting}>Reset Password</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[#49454F] dark:text-[#938F99]">Enter a new password. The staff member can log in immediately.</p>
          <Input label="New Password" type="password" placeholder="Min 6 characters"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Remove Team Member"
        message="Are you sure? This cannot be undone."
        loading={deleteStaff.isPending}
      />
    </div>
  )
}
