import { useAuth } from '../../contexts/AuthContext'
import { ChatThread } from '../../components/ui/ChatThread'
import { ProfileSectionHeader } from '../../components/staff/ProfileSectionHeader'

export function MyProfileNotes() {
  const { staff } = useAuth()
  if (!staff) return null

  return (
    <div className="space-y-2">
      <ProfileSectionHeader title="Notes" subtitle="Chat with the studio owner" />
      <div style={{ maxWidth: 640 }}>
        <ChatThread
          staffId={staff.id}
          currentSenderId={staff.id}
          currentSenderRole="staff"
          emptyLabel="No messages yet — the studio owner can leave you a note here, and you can reply."
          height={480}
        />
      </div>
    </div>
  )
}
