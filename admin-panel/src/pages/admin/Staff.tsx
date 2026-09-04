import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Search, Sparkles, ShieldCheck, UserCog, MessageCircle, LogIn } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffList } from '../../hooks/useStaff'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { toTitleCase } from '../../lib/utils'
import { StaffFormModal } from '../../components/staff/StaffFormModal'
import type { Staff } from '../../types/database'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const roleConfig = {
  admin: { color: 'bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF]', icon: ShieldCheck, label: 'Admin' },
  staff: { color: 'bg-[#E8DEF8] dark:bg-[#4A4458] text-[#1D192B] dark:text-[#E8DEF8]', icon: Sparkles, label: 'Staff' },
  receptionist: { color: 'bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0]', icon: UserCog, label: 'Receptionist' },
}

export function StaffPage() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()
  const { loginAsStaff } = useAuth()

  const { data: staffList = [], isLoading } = useStaffList()

  // "Online" means actually checked in today (check_in set, no check_out yet) —
  // not just employment status. Same definition as the staff chat drawer.
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: onlineStaffIds = [] } = useQuery({
    queryKey: ['online_staff', today],
    queryFn: async () => {
      const { data, error } = await db
        .from('attendance')
        .select('staff_id')
        .eq('date', today)
        .not('check_in', 'is', null)
        .is('check_out', null)
      if (error) throw error
      return (data as { staff_id: string }[]).map(d => d.staff_id)
    },
    refetchInterval: 30000,
  })

  const filtered = staffList.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search)
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Our Team</h1>
          <p className="text-[#49454F] dark:text-[#938F99] text-sm">{staffList.filter(s => s.active).length} active · {staffList.length} total</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>Add Team Member</Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#79747E] dark:text-[#938F99]" />
        <input
          type="text"
          placeholder="Search team member..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] placeholder-[#79747E] dark:placeholder-[#938F99] text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4]"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-[#6750A4] dark:border-[#D0BCFF] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(s => {
            const rc = roleConfig[s.role as keyof typeof roleConfig] ?? roleConfig.staff
            const RoleIcon = rc.icon
            return (
              <div
                key={s.id}
                onClick={() => navigate(`/staff/${s.id}`)}
                className="relative cursor-pointer rounded-[22px] overflow-hidden transition-all border border-[#E8DEF8] dark:border-[#382E48] bg-white dark:bg-[#1D192B] hover:border-[#CAC4D0] dark:hover:border-[#4F378B] hover:shadow-md"
              >
                {/* Photo */}
                <div className="relative h-40 bg-gradient-to-br from-[#EADDFF] to-[#E8DEF8]">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} alt={s.name} className="w-full h-full object-cover" style={{ objectPosition: 'center 8%', transform: 'scale(1.9)', transformOrigin: 'center 12%' }} />
                  ) : (
                    <div className="w-full h-full gradient-bg flex items-center justify-center text-white font-bold text-2xl">
                      {s.name.charAt(0)}
                    </div>
                  )}
                  {/* Role badge, top-right — mirrors the "distance" chip in the reference design */}
                  <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold shadow-sm ${rc.color} bg-white/95 dark:bg-white/90`}>
                    {rc.label}
                  </span>
                  {/* Chat — every team member gets their own chat page, top-left */}
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/staff/${s.id}/chat`) }}
                    title={`Chat with ${s.name.split(' ')[0]}`}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur shadow-sm flex items-center justify-center hover:bg-white transition-colors"
                  >
                    <MessageCircle size={13} className="text-[#49454F]" />
                  </button>
                  {/* Quick Direct Login button */}
                  {s.role !== 'admin' && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        loginAsStaff(s)
                        toast.success(`Logged in as ${toTitleCase(s.name)}!`)
                        if (s.role === 'receptionist') navigate('/bookings')
                        else navigate('/my-profile')
                      }}
                      title={`Direct login as ${toTitleCase(s.name)}`}
                      className="absolute top-2 left-10 h-7 px-2.5 rounded-full bg-white/95 backdrop-blur shadow-sm flex items-center gap-1.5 hover:bg-white text-[11px] font-bold text-[#6750A4] transition-all hover:scale-105 active:scale-95"
                    >
                      <LogIn size={11} />
                      <span>Login</span>
                    </button>
                  )}
                  {/* Name + speciality + staff code — overlaid directly on the photo */}
                  <div className="absolute inset-x-0 bottom-0 pt-8 pb-2.5 px-2.5"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)' }}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(() => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const code = (s as any).staff_code || (
                        s.name.toUpperCase().includes('NIMISHA') ? 'NLX-01' :
                        s.name.toUpperCase().includes('REJEENA') ? 'NLX-02' :
                        s.name.toUpperCase().includes('SANIYA') ? 'NLX-03' :
                        `NLX-${s.id.slice(0, 4).toUpperCase()}`
                      )
                      return (
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="text-white font-semibold text-sm truncate drop-shadow-sm capitalize">{toTitleCase(s.name)}</p>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-black/40 text-white/90 border border-white/20 shrink-0">
                            {code}
                          </span>
                        </div>
                      )
                    })()}
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlineStaffIds.includes(s.id) ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <RoleIcon size={10} className="text-white/70 shrink-0" />
                      <span className="text-[10px] text-white/85 truncate">{(s as Staff & { speciality?: string }).speciality ?? rc.label}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-[#79747E] dark:text-[#938F99] text-sm">No team members found</div>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      <StaffFormModal open={showModal} onClose={() => setShowModal(false)} editingStaff={null} />
    </div>
  )
}
