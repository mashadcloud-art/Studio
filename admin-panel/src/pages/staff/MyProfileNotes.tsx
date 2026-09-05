import { useAuth } from '../../contexts/AuthContext'
import { ChatThread } from '../../components/ui/ChatThread'
import { ProfileSectionHeader } from '../../components/staff/ProfileSectionHeader'

export function MyProfileNotes() {
  const { staff } = useAuth()
  if (!staff) return null

  return (
    <div className="h-[calc(100dvh-175px)] max-w-2xl mx-auto flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 mb-2">
        <ProfileSectionHeader title="Messages & Notes" subtitle="Chat with the studio owner" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ChatThread
          staffId={staff.id}
          staffName={staff.name}
          currentSenderId={staff.id}
          currentSenderRole="staff"
          emptyLabel="No messages yet — the studio owner can leave you a note here, and you can reply."
          height="100%"
        />
      </div>
    </div>
  )
}
