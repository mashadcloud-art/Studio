import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useStaffById } from '../../hooks/useStaff'
import { useAuth } from '../../contexts/AuthContext'
import { ChatThread } from '../../components/ui/ChatThread'

export function StaffChatPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { staff: currentAdmin } = useAuth()
  const { data: staff, isLoading } = useStaffById(id)

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[#CAC4D0]" />
      </div>
    )
  }

  if (!staff || !currentAdmin) {
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

  return (
    <div className="h-[calc(100dvh-175px)] max-w-2xl mx-auto flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate('/staff')}
          aria-label="Back to team"
          className="w-9 h-9 rounded-full border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] flex items-center justify-center shrink-0 hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors"
        >
          <ArrowLeft size={16} className="text-[#1D1A22] dark:text-[#E6E0E9]" />
        </button>
        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-[#F3EDF7] dark:bg-[#2B2930] flex items-center justify-center">
          {staff.avatar_url ? (
            <img
              src={staff.avatar_url}
              alt={staff.name}
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center 8%', transform: 'scale(1.9)', transformOrigin: 'center 12%' }}
            />
          ) : (
            <span className="text-[#49454F] dark:text-[#CAC4D0] font-bold text-sm">{staff.name.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-[#1D1A22] dark:text-[#E6E0E9] truncate">{staff.name}</h1>
          <p className="text-xs text-[#79747E] dark:text-[#938F99] flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${staff.active ? 'bg-green-400' : 'bg-gray-300'}`} />
            {staff.active ? 'Online' : 'Offline'}
          </p>
        </div>
      </div>

      {/* Full chat thread */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ChatThread
          staffId={staff.id}
          currentSenderId={currentAdmin.id}
          currentSenderRole="admin"
          emptyLabel="No messages yet — send a note or a voice note."
          height="100%"
        />
      </div>
    </div>
  )
}
