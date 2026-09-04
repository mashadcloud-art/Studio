import { useEffect } from 'react'
import { X, Clock, Check, XCircle, CheckCircle2, Receipt } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications, useReviewOvertime, useReviewExpenseEdit, useMarkAllNotificationsRead, type AppNotification } from '../../hooks/useNotifications'
import { formatCurrency } from '../../lib/utils'

interface OvertimeApprovalsDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const statusPill: Record<string, string> = {
  pending: 'bg-[#FFDCC2] text-[#361400] dark:bg-[#5C2900] dark:text-[#FFB781]',
  approved: 'bg-[#C4EED0] text-[#146C2E] dark:bg-[#003913] dark:text-[#79DF84]',
  rejected: 'bg-[#FFD8E4] text-[#31111D] dark:bg-[#58102B] dark:text-[#FFB3C7]',
  none: 'bg-[#F3EDF7] text-[#49454F] dark:bg-[#2B2930] dark:text-[#CAC4D0]',
}

export function OvertimeApprovalsDrawer({ isOpen, onClose }: OvertimeApprovalsDrawerProps) {
  const { staff: currentUser } = useAuth()
  const { data: notifications = [] } = useNotifications()
  const reviewOvertime = useReviewOvertime()
  const reviewExpenseEdit = useReviewExpenseEdit()
  const markAllRead = useMarkAllNotificationsRead()

  // Clear the bell badge the moment the drawer is actually opened and looked at.
  useEffect(() => {
    if (isOpen && currentUser) {
      markAllRead.mutate({ notifications, userId: currentUser.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen || !currentUser) return null

  return (
    <div className="fixed inset-y-0 right-0 z-[100] flex">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-[#1D192B] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300 z-10 border-l border-[#E8DEF8] dark:border-[#382E48]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#E8DEF8] dark:border-[#382E48] bg-[#F3EDF7] dark:bg-[#2B2930]">
          <div className="flex items-center gap-2">
            <Clock className="text-[#6750A4] dark:text-[#D0BCFF]" size={20} />
            <h2 className="text-base font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Approvals</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#49454F] dark:text-[#CAC4D0] transition">
            <X size={20} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-[#FEF7FF] dark:bg-[#141218] p-2 space-y-2">
          {notifications.length === 0 && (
            <div className="text-center py-12 text-sm text-[#79747E] dark:text-[#938F99]">
              No pending requests — overtime and expense-edit approvals show up here.
            </div>
          )}

          {notifications.map(n => (
            n.type === 'expense_edit_request'
              ? <ExpenseEditCard key={n.id} n={n} currentUserId={currentUser.id} onReview={reviewExpenseEdit.mutate} reviewing={reviewExpenseEdit.isPending} />
              : <OvertimeCard key={n.id} n={n} currentUserId={currentUser.id} onReview={reviewOvertime.mutate} reviewing={reviewOvertime.isPending} />
          ))}
        </div>
      </div>
    </div>
  )
}

function OvertimeCard({ n, currentUserId, onReview, reviewing }: {
  n: AppNotification
  currentUserId: string
  onReview: (args: { attendanceId: string; status: 'approved' | 'rejected'; reviewerId: string }) => void
  reviewing: boolean
}) {
  const status = n.attendance?.ot_status ?? 'none'
  const isPending = status === 'pending' && !!n.attendance_id
  return (
    <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] rounded-2xl p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9] truncate">{n.staff?.name ?? 'Team member'}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${statusPill[status]}`}>
                {status}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-[#1D1A22] dark:text-[#E6E0E9] mt-1">{n.title}</p>
            {n.body && <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-0.5">{n.body}</p>}
          </div>
          <span className="text-[10px] text-[#938F99] dark:text-[#79747E] shrink-0 whitespace-nowrap">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
          </span>
        </div>

        {isPending ? (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onReview({ attendanceId: n.attendance_id!, status: 'approved', reviewerId: currentUserId })}
              disabled={reviewing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#146C2E] dark:bg-[#79DF84] text-white dark:text-[#003913] text-xs font-bold hover:opacity-90 transition disabled:opacity-50"
            >
              <Check size={13} /> Approve
            </button>
            <button
              onClick={() => onReview({ attendanceId: n.attendance_id!, status: 'rejected', reviewerId: currentUserId })}
              disabled={reviewing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#CAC4D0] dark:border-[#44474F] text-[#49454F] dark:text-[#CAC4D0] text-xs font-bold hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition disabled:opacity-50"
            >
              <XCircle size={13} /> Reject
            </button>
          </div>
        ) : status === 'approved' ? (
          <div className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold text-[#146C2E] dark:text-[#79DF84]">
            <CheckCircle2 size={13} /> Approved — counted toward pay
          </div>
        ) : status === 'rejected' ? (
          <div className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold text-[#B3261E] dark:text-[#F2B8B5]">
            <XCircle size={13} /> Rejected — not counted
          </div>
        ) : null}
    </div>
  )
}

function ExpenseEditCard({ n, currentUserId, onReview, reviewing }: {
  n: AppNotification
  currentUserId: string
  onReview: (args: { notificationId: string; expenseId: string; decision: 'approved' | 'rejected'; reviewerId: string }) => void
  reviewing: boolean
}) {
  const status = n.status
  const isPending = status === 'pending' && !!n.expense_id
  const windowOpen = n.expense?.edit_approved_until && new Date(n.expense.edit_approved_until) > new Date()

  return (
    <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] rounded-2xl p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Receipt size={12} className="text-[#6750A4] dark:text-[#D0BCFF] shrink-0" />
            <span className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9] truncate">{n.staff?.name ?? 'Team member'}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${statusPill[status]}`}>
              {status}
            </span>
          </div>
          <p className="text-[13px] font-semibold text-[#1D1A22] dark:text-[#E6E0E9] mt-1">{n.title}</p>
          {n.expense && (
            <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-0.5">
              "{n.expense.title}" · {formatCurrency(n.expense.amount)} · {n.expense.category}
            </p>
          )}
        </div>
        <span className="text-[10px] text-[#938F99] dark:text-[#79747E] shrink-0 whitespace-nowrap">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </span>
      </div>

      {isPending ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onReview({ notificationId: n.id, expenseId: n.expense_id!, decision: 'approved', reviewerId: currentUserId })}
            disabled={reviewing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#146C2E] dark:bg-[#79DF84] text-white dark:text-[#003913] text-xs font-bold hover:opacity-90 transition disabled:opacity-50"
          >
            <Check size={13} /> Approve (30 min)
          </button>
          <button
            onClick={() => onReview({ notificationId: n.id, expenseId: n.expense_id!, decision: 'rejected', reviewerId: currentUserId })}
            disabled={reviewing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#CAC4D0] dark:border-[#44474F] text-[#49454F] dark:text-[#CAC4D0] text-xs font-bold hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition disabled:opacity-50"
          >
            <XCircle size={13} /> Reject
          </button>
        </div>
      ) : status === 'approved' ? (
        <div className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold text-[#146C2E] dark:text-[#79DF84]">
          <CheckCircle2 size={13} />
          {windowOpen
            ? `Edit window open until ${new Date(n.expense!.edit_approved_until!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Approved — edit window has closed'}
        </div>
      ) : status === 'rejected' ? (
        <div className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold text-[#B3261E] dark:text-[#F2B8B5]">
          <XCircle size={13} /> Rejected
        </div>
      ) : null}
    </div>
  )
}
