import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Pencil, MoreVertical, Clock, TrendingDown, Receipt } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications, useRequestExpenseEdit } from '../../hooks/useNotifications'
import { Input, Select, TextArea } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { formatCurrency, formatDate, getTodayString, getMonthRange } from '../../lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface Expense {
  id: string
  title: string
  amount: number
  category: string
  date: string
  notes: string | null
  created_at: string
  edit_approved_by: string | null
  edit_approved_until: string | null
}

const CATEGORIES = ['Supplies', 'Equipment', 'Utilities', 'Rent', 'Salary', 'Marketing', 'Maintenance', 'Food & Drinks', 'Transport', 'Other']

const schema = z.object({
  title: z.string().min(2, 'Title required'),
  amount: z.coerce.number().min(0.01, 'Amount required'),
  category: z.string().min(1, 'Category required'),
  date: z.string().min(1, 'Date required'),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function ExpensesPage() {
  const { staff, isAdmin } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'))
  const qc = useQueryClient()
  const { data: notifications = [] } = useNotifications()
  const requestEdit = useRequestExpenseEdit()

  const [year, month] = filterMonth.split('-').map(Number)
  const { start, end } = getMonthRange(year, month)

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', filterMonth],
    queryFn: async () => {
      const { data, error } = await db.from('expenses')
        .select('*')
        .gte('date', start).lte('date', end)
        .order('date', { ascending: false })
      if (error) throw error
      return data as Expense[]
    },
  })

  const createExpense = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await db.from('expenses').insert({
        ...data, added_by: staff?.id ?? null
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense added'); setShowModal(false); reset() },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateExpense = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const { error } = await db.from('expenses').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense updated'); setEditingExpense(null); reset() },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Deleted') },
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: getTodayString(), category: 'Supplies' },
  })

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  // Group by category
  const byCat = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})

  const categoryBreakdown = Object.entries(byCat).sort(([, a], [, b]) => b - a)

  function openEdit(e: Expense) {
    reset({ title: e.title, amount: e.amount, category: e.category, date: e.date, notes: e.notes ?? '' })
    setEditingExpense(e)
    setOpenMenuId(null)
  }

  // Admins can always edit. Anyone else needs an open, admin-approved window
  // on this specific expense (see the notification bell / Approvals drawer).
  function hasOpenWindow(e: Expense) {
    return !!(e.edit_approved_until && new Date(e.edit_approved_until) > new Date())
  }

  function pendingRequestFor(e: Expense) {
    return notifications.some(n => n.type === 'expense_edit_request' && n.expense_id === e.id && n.status === 'pending')
  }

  function editMenuState(e: Expense): { label: string; disabled: boolean; tone: 'default' | 'active' | 'pending' } {
    if (isAdmin) return { label: 'Edit', disabled: false, tone: 'default' }
    if (hasOpenWindow(e)) {
      const mins = Math.max(1, Math.ceil((new Date(e.edit_approved_until!).getTime() - Date.now()) / 60000))
      return { label: `Edit (${mins}m left)`, disabled: false, tone: 'active' }
    }
    if (pendingRequestFor(e)) return { label: 'Awaiting admin approval', disabled: true, tone: 'pending' }
    return { label: 'Request edit approval', disabled: false, tone: 'default' }
  }

  function handleEditClick(e: Expense) {
    if (isAdmin || hasOpenWindow(e)) { openEdit(e); return }
    if (pendingRequestFor(e)) { setOpenMenuId(null); return }
    setOpenMenuId(null)
    requestEdit.mutate(
      { expenseId: e.id, staffId: staff!.id, staffName: staff!.name, expenseTitle: e.title, expenseAmount: e.amount },
      { onSuccess: () => toast.success('Edit request sent to admin') }
    )
  }

  return (
    <div style={{ maxWidth: '100%' }} className="space-y-5">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Expenses</h1>
          <p className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 13, marginTop: 3 }}>Track studio expenses and costs</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => { reset(); setShowModal(true) }}>
          Add Expense
        </Button>
      </div>

      {/* Month filter */}
      <input
        type="month"
        value={filterMonth}
        onChange={e => setFilterMonth(e.target.value)}
        className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
        style={{
          padding: '8px 14px', borderRadius: 10,
          fontSize: 13, outline: 'none',
          fontFamily: 'Inter, sans-serif'
        }}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="bg-[#EADDFF] dark:bg-[#4F378B]" style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={18} className="text-[#21005D] dark:text-[#EADDFF]" />
            </div>
          </div>
          <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
            {formatCurrency(totalExpenses)}
          </div>
          <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12, marginTop: 4 }}>Total Expenses</div>
        </div>
        <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="bg-[#EADDFF] dark:bg-[#4F378B]" style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={18} className="text-[#21005D] dark:text-[#EADDFF]" />
            </div>
          </div>
          <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
            {expenses.length}
          </div>
          <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12, marginTop: 4 }}>Total Entries</div>
        </div>
        <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, padding: '18px 20px' }}>
          <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Top Category
          </div>
          <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 16, fontWeight: 800 }}>
            {categoryBreakdown[0]?.[0] ?? '—'}
          </div>
          <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12, marginTop: 2 }}>
            {categoryBreakdown[0] ? formatCurrency(categoryBreakdown[0][1]) : '—'}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, padding: 20 }}>
          <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>By Category</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {categoryBreakdown.map(([cat, amt]) => (
              <div key={cat}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 13, fontWeight: 500 }}>{cat}</span>
                  <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 700 }}>{formatCurrency(amt)}</span>
                </div>
                <div className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ height: 4, borderRadius: 99 }}>
                  <div className="bg-[#6750A4] dark:bg-[#D0BCFF]" style={{
                    height: '100%', borderRadius: 99,
                    width: `${(amt / (categoryBreakdown[0][1] || 1)) * 100}%`
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses list */}
      <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, overflow: 'hidden' }}>
        <div className="border-b border-[#F3EDF7] dark:border-[#382E48]" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}>
          <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 700 }}>All Expenses</span>
          <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12 }}>{expenses.length} entries</span>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="border-[#E8DEF8] dark:border-[#382E48]" style={{ width: 24, height: 24, borderWidth: 2, borderStyle: 'solid', borderTopColor: '#6750A4', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-[#79747E] dark:text-[#938F99]" style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
            No expenses this month
          </div>
        ) : (
          expenses.map((e, i) => {
            const menuState = editMenuState(e)
            const badge = isAdmin ? null
              : hasOpenWindow(e) ? { text: `Edit window open · ${Math.max(1, Math.ceil((new Date(e.edit_approved_until!).getTime() - Date.now()) / 60000))}m left`, color: '#146C2E' }
              : pendingRequestFor(e) ? { text: 'Edit requested — awaiting admin approval', color: '#B26A00' }
              : null

            return (
            <div key={e.id} className={i < expenses.length - 1 ? 'border-b border-[#F3EDF7] dark:border-[#382E48]' : ''} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px'
            }}>
              <div className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{
                width: 38, height: 38, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <TrendingDown size={16} className="text-[#49454F] dark:text-[#CAC4D0]" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
                <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 12, marginTop: 1 }}>
                  {e.category} · {formatDate(e.date)}
                </div>
                {e.notes && <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 11, marginTop: 1 }}>{e.notes}</div>}
                {badge && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, fontWeight: 700, color: badge.color }}>
                    <Clock size={10} /> {badge.text}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', flexShrink: 0 }}>
                <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 15, fontWeight: 700 }}>{formatCurrency(e.amount)}</span>
                <button
                  onClick={() => setOpenMenuId(id => (id === e.id ? null : e.id))}
                  className="text-[#79747E] dark:text-[#938F99]"
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: openMenuId === e.id ? 'rgba(103,80,164,0.12)' : 'transparent',
                  }}
                >
                  <MoreVertical size={16} />
                </button>

                {openMenuId === e.id && (
                  <>
                    <div onClick={() => setOpenMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div
                      className="bg-white dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#44474F]"
                      style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, borderRadius: 14, minWidth: 200, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}
                    >
                      <button
                        onClick={() => handleEditClick(e)}
                        disabled={menuState.disabled}
                        className={menuState.tone === 'pending' ? 'text-[#B26A00]' : 'text-[#1D1A22] dark:text-[#E6E0E9]'}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10,
                          border: 'none', background: 'none', cursor: menuState.disabled ? 'default' : 'pointer',
                          fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, textAlign: 'left', opacity: menuState.disabled ? 0.6 : 1,
                        }}
                        onMouseEnter={ev => { if (!menuState.disabled) ev.currentTarget.style.background = 'rgba(103,80,164,0.08)' }}
                        onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}
                      >
                        {menuState.tone === 'pending' ? <Clock size={14} /> : <Pencil size={14} />}
                        {menuState.label}
                      </button>
                      <button
                        onClick={() => { setDeletingId(e.id); setOpenMenuId(null) }}
                        className="text-[#B3261E] dark:text-[#F2B8B5]"
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10,
                          border: 'none', background: 'none', cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, textAlign: 'left',
                        }}
                        onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(179,38,30,0.08)')}
                        onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            )
          })
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={showModal || !!editingExpense}
        onClose={() => { setShowModal(false); setEditingExpense(null) }}
        title={editingExpense ? 'Edit Expense' : 'Add Expense'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowModal(false); setEditingExpense(null) }}>Cancel</Button>
            <Button form="expense-form" type="submit" loading={isSubmitting}>{editingExpense ? 'Save Changes' : 'Add Expense'}</Button>
          </>
        }
      >
        <form
          id="expense-form"
          onSubmit={handleSubmit(d => (editingExpense ? updateExpense.mutate({ id: editingExpense.id, data: d }) : createExpense.mutate(d)))}
          className="space-y-4"
        >
          <Input label="Title" placeholder="e.g. Nail supplies" error={errors.title?.message} {...register('title')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount (₹)" type="number" step="0.01" error={errors.amount?.message} {...register('amount')} />
            <Input label="Date" type="date" error={errors.date?.message} {...register('date')} />
          </div>
          <Select
            label="Category"
            options={CATEGORIES.map(c => ({ value: c, label: c }))}
            error={errors.category?.message}
            {...register('category')}
          />
          <TextArea label="Notes (optional)" {...register('notes')} />
        </form>
      </Modal>

      <ConfirmModal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => { deleteExpense.mutate(deletingId!); setDeletingId(null) }}
        title="Delete Expense"
        message="Are you sure you want to delete this expense?"
        loading={deleteExpense.isPending}
      />
    </div>
  )
}
