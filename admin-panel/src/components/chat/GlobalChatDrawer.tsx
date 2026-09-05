import { useState } from 'react'
import { X, MessageCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffList } from '../../hooks/useStaff'
import { ChatThread } from '../ui/ChatThread'
import { cn } from '../../lib/utils'
import type { Staff } from '../../types/database'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface GlobalChatDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function GlobalChatDrawer({ isOpen, onClose }: GlobalChatDrawerProps) {
  const { staff: currentAdmin, isAdmin } = useAuth()
  const { data: staffList = [] } = useStaffList()
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  // Fetch staff who are currently checked in today (check_in is not null, check_out is null)
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
    refetchInterval: 30000 // Poll every 30 seconds
  })

  if (!isOpen || !currentAdmin) return null

  const activeStaff = staffList.find((s: Staff) => s.id === selectedStaffId)

  return (
    <div className="fixed inset-y-0 right-0 z-[100] flex">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#1D192B] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300 z-10 border-l border-[#E8DEF8] dark:border-[#382E48]">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-4 border-b border-[#E8DEF8] dark:border-[#382E48] bg-[#F3EDF7] dark:bg-[#2B2930] pt-[max(env(safe-area-inset-top),16px)]">
          <div className="flex items-center gap-2">
            <MessageCircle className="text-[#6750A4] dark:text-[#D0BCFF]" size={20} />
            <h2 className="text-base font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
              {isAdmin && !selectedStaffId ? 'Staff Chat' : activeStaff ? `Chat with ${activeStaff.name}` : 'My Chat'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#49454F] dark:text-[#CAC4D0] transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-[#FEF7FF] dark:bg-[#141218]">
          {isAdmin ? (
            selectedStaffId ? (
              <div className="flex-1 min-h-0 flex flex-col h-full relative">
                <button 
                  onClick={() => setSelectedStaffId(null)}
                  className="shrink-0 px-4 py-2.5 text-sm font-semibold text-[#6750A4] dark:text-[#D0BCFF] bg-white dark:bg-[#1D192B] border-b border-[#E8DEF8] dark:border-[#382E48] flex items-center gap-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  ← Back to staff list
                </button>
                <div className="flex-1 min-h-0 overflow-hidden p-1 sm:p-2 flex flex-col">
                   <ChatThread
                    staffId={selectedStaffId}
                    staffName={activeStaff?.name}
                    currentSenderId={currentAdmin.id}
                    currentSenderRole="admin"
                    height="100%"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {staffList.filter((s: Staff) => s.id !== currentAdmin.id).map((staff: Staff) => (
                  <button
                    key={staff.id}
                    onClick={() => setSelectedStaffId(staff.id)}
                    className="w-full text-left p-3 rounded-xl hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] flex items-center gap-3 transition cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#EADDFF] dark:bg-[#4F378B] flex items-center justify-center shrink-0">
                      {staff.avatar_url ? (
                        <img src={staff.avatar_url} alt={staff.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-[#21005D] dark:text-[#EADDFF] font-bold text-sm">
                          {staff.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-[#1D1A22] dark:text-[#E6E0E9] text-sm">{staff.name}</div>
                      <div className="text-xs text-[#79747E] dark:text-[#938F99] flex items-center gap-1 mt-0.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full', onlineStaffIds.includes(staff.id) ? 'bg-green-500' : 'bg-gray-400')} />
                        {onlineStaffIds.includes(staff.id) ? 'Online' : 'Offline'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden p-1 sm:p-2 flex flex-col">
              <ChatThread
                staffId={currentAdmin.id}
                currentSenderId={currentAdmin.id}
                currentSenderRole="staff"
                height="100%"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
