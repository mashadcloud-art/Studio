import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign, Wallet, Building2, Pencil, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useStaffList } from '../../hooks/useStaff'
import { Input, Select, TextArea } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { formatCurrency, getTodayString, getMonthRange } from '../../lib/utils'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ────────────────────────────────────────────────────────────────────

interface Expense {
  id: string; title: string; amount: number; category: string
  date: string; notes: string | null; created_at: string
}

interface RecurringExpense {
  id: string; title: string; amount: number; category: string
  frequency: string; notes: string | null; active: boolean
}

const EXPENSE_CATEGORIES = [
  'Supplies & Products', 'Equipment', 'Rent', 'Electricity', 'Water',
  'Salaries', 'Bank Loan / EMI', 'Marketing', 'Maintenance',
  'Food & Beverages', 'Transport', 'Commission', 'Insurance', 'Other'
]

// 'Salaries' is intentionally not offered here anymore — staff pay now flows into
// fixed costs automatically from each staff member's salary (Team page), so a manual
// duplicate entry is no longer needed. See totalStaffSalaries below.
const RECURRING_CATEGORIES = [
  'Rent', 'Electricity', 'Water', 'Bank Loan / EMI',
  'Insurance', 'Internet', 'Marketing', 'Commission', 'Other'
]

// ── Schemas ───────────────────────────────────────────────────────────────────

const expenseSchema = z.object({
  title: z.string().min(2, 'Required'),
  amount: z.coerce.number().min(0.01, 'Required'),
  category: z.string().min(1, 'Required'),
  date: z.string().min(1, 'Required'),
  notes: z.string().optional(),
})
type ExpenseForm = z.infer<typeof expenseSchema>

const recurringSchema = z.object({
  title: z.string().min(2, 'Required'),
  amount: z.coerce.number().min(0.01, 'Required'),
  category: z.string().min(1, 'Required'),
  frequency: z.enum(['monthly', 'weekly', 'yearly']),
  notes: z.string().optional(),
})
type RecurringForm = z.infer<typeof recurringSchema>

// ── Section Header ────────────────────────────────────────────────────────────

const SectionTitle = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div style={{ marginBottom: 14 }}>
    <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.3px' }}>{children}</div>
    {sub && <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
  </div>
)

const BigCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div className="bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]" style={{ borderRadius: 20, padding: 20, ...style }}>
    {children}
  </div>
)

// ── Main Component ────────────────────────────────────────────────────────────

export function FinancePage() {
  const now = new Date()
  const [filterMonth, setFilterMonth] = useState(format(now, 'yyyy-MM'))
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showRecurringModal, setShowRecurringModal] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)
  const [deletingRecurringId, setDeletingRecurringId] = useState<string | null>(null)
  const [cashInHand, setCashInHand] = useState('')
  const [cashInAccount, setCashInAccount] = useState('')
  const [savingCash, setSavingCash] = useState(false)
  const [salariesExpanded, setSalariesExpanded] = useState(false)
  const [financeTab, setFinanceTab] = useState<'onetime' | 'recurring'>('onetime')
  const qc = useQueryClient()

  const [year, month] = filterMonth.split('-').map(Number)
  const { start, end } = getMonthRange(year, month)

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ['expenses', filterMonth],
    queryFn: async () => {
      const { data, error } = await db.from('expenses').select('*')
        .gte('date', start).lte('date', end).order('date', { ascending: false })
      if (error) throw error
      return data as Expense[]
    },
  })

  const { data: recurring = [] } = useQuery({
    queryKey: ['recurring_expenses'],
    queryFn: async () => {
      const { data, error } = await db.from('recurring_expenses').select('*').order('amount', { ascending: false })
      if (error) throw error
      return data as RecurringExpense[]
    },
  })

  // Every account links up: a staff member's salary (Team page) flows straight into
  // fixed monthly costs and the P&L here — no separate manual entry to keep in sync.
  const { data: staffList = [] } = useStaffList()

  const { data: revenue } = useQuery({
    queryKey: ['revenue', filterMonth],
    queryFn: async () => {
      const { data, error } = await db.from('work_records')
        .select('amount').gte('date', start).lte('date', end)
      if (error) throw error
      return (data as { amount: number }[]).reduce((s, r) => s + r.amount, 0)
    },
  })

  const { data: cashSettings } = useQuery({
    queryKey: ['cash_settings'],
    queryFn: async () => {
      const { data } = await db.from('settings')
        .select('key, value')
        .in('key', ['cash_in_hand', 'cash_in_account'])
      const map: Record<string, string> = {}
      ;(data as { key: string; value: string }[] ?? []).forEach(s => { map[s.key] = s.value })
      setCashInHand(map['cash_in_hand'] ?? '0')
      setCashInAccount(map['cash_in_account'] ?? '0')
      return map
    },
  })

  // ── Calculated values ───────────────────────────────────────────────────────

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  // Legacy manually-entered "Salaries" recurring rows (if any exist from before this was
  // automatic) are excluded from the total so pay is never counted twice — the live
  // Staff Salaries figure below supersedes them.
  const manualRecurring = recurring.filter(r => r.category !== 'Salaries')
  const monthlyRecurringManual = manualRecurring
    .filter(r => r.active && r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)

  const activeStaffForSalary = staffList.filter(s => s.active)
  const totalStaffSalaries = activeStaffForSalary.reduce((s, st) => s + (st.salary ?? 0), 0)

  const monthlyRecurring = monthlyRecurringManual + totalStaffSalaries
  const totalCosts = totalExpenses + monthlyRecurring
  const grossProfit = (revenue ?? 0) - totalCosts
  const isProfit = grossProfit >= 0

  const totalCash = parseFloat(cashInHand || '0') + parseFloat(cashInAccount || '0')

  // Expense by category
  const byCat = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})

  // ── Mutations ───────────────────────────────────────────────────────────────

  const addExpense = useMutation({
    mutationFn: async (data: ExpenseForm) => {
      const { error } = await db.from('expenses').insert(data)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense added'); setShowExpenseModal(false); resetExpense() },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Deleted') },
  })

  const saveRecurring = useMutation({
    mutationFn: async (data: RecurringForm) => {
      if (editingRecurring) {
        const { error } = await db.from('recurring_expenses').update(data).eq('id', editingRecurring.id)
        if (error) throw error
      } else {
        const { error } = await db.from('recurring_expenses').insert({ ...data, active: true })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring_expenses'] })
      toast.success(editingRecurring ? 'Updated' : 'Added')
      setShowRecurringModal(false)
      setEditingRecurring(null)
      resetRecurring()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteRecurring = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('recurring_expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring_expenses'] }); toast.success('Deleted') },
  })

  const saveCash = async () => {
    setSavingCash(true)
    try {
      await db.from('settings').upsert({ key: 'cash_in_hand', value: cashInHand }, { onConflict: 'key' })
      await db.from('settings').upsert({ key: 'cash_in_account', value: cashInAccount }, { onConflict: 'key' })
      qc.invalidateQueries({ queryKey: ['cash_settings'] })
      toast.success('Cash balances saved')
    } catch { toast.error('Failed to save') }
    setSavingCash(false)
  }

  // ── Forms ───────────────────────────────────────────────────────────────────

  const { register: regExp, handleSubmit: handleExp, reset: resetExpense, formState: { errors: expErrors, isSubmitting: expSubmitting } } = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { date: getTodayString(), category: 'Supplies & Products' },
  })

  const { register: regRec, handleSubmit: handleRec, reset: resetRecurring, setValue: setRecVal, formState: { errors: recErrors, isSubmitting: recSubmitting } } = useForm<RecurringForm>({
    resolver: zodResolver(recurringSchema),
    defaultValues: { frequency: 'monthly', category: 'Rent' },
  })

  const openEditRecurring = (r: RecurringExpense) => {
    setEditingRecurring(r)
    setRecVal('title', r.title)
    setRecVal('amount', r.amount)
    setRecVal('category', r.category)
    setRecVal('frequency', r.frequency as 'monthly' | 'weekly' | 'yearly')
    setRecVal('notes', r.notes ?? '')
    setShowRecurringModal(true)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '100%' }} className="space-y-5">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>Finance</h1>
          <p className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 13, marginTop: 3 }}>Expenses, P&L, and cash management</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
            style={{ padding: '8px 12px', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
        </div>
      </div>

      {/* ── P&L Summary ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: formatCurrency(revenue ?? 0), icon: <TrendingUp size={18} />, dark: true },
          { label: 'Total Expenses', value: formatCurrency(totalCosts), icon: <TrendingDown size={18} />, dark: false },
          {
            label: isProfit ? 'NET PROFIT' : 'NET LOSS',
            value: formatCurrency(Math.abs(grossProfit)),
            icon: <DollarSign size={18} />,
            dark: false,
            accent: isProfit ? '#16a34a' : '#dc2626',
          },
          { label: 'Total Cash', value: formatCurrency(totalCash), icon: <Wallet size={18} />, dark: false },
        ].map(card => (
          <div key={card.label}
            className={card.dark
              ? 'bg-[#6750A4] dark:bg-[#D0BCFF] border border-[#6750A4] dark:border-[#D0BCFF]'
              : 'bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48]'}
            style={{ borderRadius: 20, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div
                className={card.dark ? 'bg-white/15 dark:bg-[#381E72]/25' : 'bg-[#EADDFF] dark:bg-[#4F378B]'}
                style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className={card.dark ? 'text-white dark:text-[#381E72]' : 'text-[#21005D] dark:text-[#EADDFF]'}>{card.icon}</span>
              </div>
              {card.accent && (
                <span style={{ fontSize: 11, fontWeight: 700, color: card.accent, background: card.accent + '15', padding: '3px 8px', borderRadius: 99 }}>
                  {isProfit ? 'PROFIT' : 'LOSS'}
                </span>
              )}
            </div>
            <div
              className={card.accent ? '' : (card.dark ? 'text-white dark:text-[#381E72]' : 'text-[#1D1A22] dark:text-[#E6E0E9]')}
              style={{ fontSize: 22, fontWeight: 800, color: card.accent ?? undefined, letterSpacing: '-0.5px', lineHeight: 1 }}>
              {card.value}
            </div>
            <div
              className={card.dark ? 'text-white/70 dark:text-[#381E72]/70' : 'text-[#49454F] dark:text-[#CAC4D0]'}
              style={{ fontSize: 11, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Cash Management ─────────────────────────────────────────────────── */}
      <BigCard>
        <SectionTitle sub="Update your current cash balances">Cash Position</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Cash in Hand (₹)</div>
            <input type="number" step="0.01" value={cashInHand} onChange={e => setCashInHand(e.target.value)}
              placeholder="0.00"
              className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Cash in Bank (₹)</div>
            <input type="number" step="0.01" value={cashInAccount} onChange={e => setCashInAccount(e.target.value)}
              placeholder="0.00"
              className="border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] bg-white dark:bg-[#1D192B]"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
          </div>
          <div>
            <button onClick={saveCash} disabled={savingCash}
              className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]"
              style={{ width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: savingCash ? 0.6 : 1 }}>
              {savingCash ? 'Saving...' : 'Save Balances'}
            </button>
          </div>
        </div>
        <div className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 13 }}>Total available cash</span>
          <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 15, fontWeight: 800 }}>{formatCurrency(totalCash)}</span>
        </div>
      </BigCard>

      {/* ── Monthly expenses + Recurring: tabbed on mobile, side by side from lg up ── */}
      {/* Mobile tab switcher — each section gets the full width instead of being squeezed in half */}
      <div className="lg:hidden flex items-center gap-1 p-1 bg-[#F3EDF7] dark:bg-[#2B2930] rounded-2xl">
        {([
          { key: 'onetime' as const, label: 'One-time Expenses' },
          { key: 'recurring' as const, label: 'Monthly Fixed Costs' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setFinanceTab(t.key)}
            className={financeTab === t.key
              ? 'bg-white dark:bg-[#1D192B] text-[#21005D] dark:text-[#EADDFF] shadow-sm'
              : 'text-[#79747E] dark:text-[#938F99]'}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 700, transition: 'all 0.2s ease' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 12 }}>

        {/* One-time expenses */}
        <div className={financeTab === 'onetime' ? 'block lg:block' : 'hidden lg:block'}>
        <BigCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <SectionTitle sub={`${format(new Date(year, month - 1, 1), 'MMMM yyyy')}`}>One-time Expenses</SectionTitle>
            <button onClick={() => { resetExpense(); setShowExpenseModal(true) }}
              className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              <Plus size={12} /> Add
            </button>
          </div>

          {/* Category bars */}
          {Object.entries(byCat).length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 4).map(([cat, amt]) => (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 11, fontWeight: 500 }}>{cat}</span>
                    <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 11, fontWeight: 700 }}>{formatCurrency(amt)}</span>
                  </div>
                  <div className="bg-[#F3EDF7] dark:bg-[#2B2930]" style={{ height: 3, borderRadius: 99 }}>
                    <div className="bg-[#6750A4] dark:bg-[#D0BCFF]" style={{ height: '100%', borderRadius: 99, width: `${(amt / (Object.values(byCat)[0] || 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {expLoading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><div className="border-[#E8DEF8] dark:border-[#382E48]" style={{ width: 20, height: 20, borderWidth: 2, borderStyle: 'solid', borderTopColor: '#6750A4', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} /></div>
          ) : expenses.length === 0 ? (
            <div className="text-[#79747E] dark:text-[#938F99]" style={{ textAlign: 'center', padding: '20px 0', fontSize: 13 }}>No expenses this month</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {expenses.map(e => (
                <div key={e.id} className="border border-[#F3EDF7] dark:border-[#382E48]" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
                    <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 11, marginTop: 1 }}>{e.category} · {e.date}</div>
                  </div>
                  <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{formatCurrency(e.amount)}</span>
                  <button onClick={() => setDeletingExpenseId(e.id)} className="text-[#CAC4D0] dark:text-[#938F99]" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                    onMouseEnter={ev => (ev.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={ev => (ev.currentTarget.style.color = '')}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-[#F3EDF7] dark:border-[#382E48]" style={{ marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12 }}>Total one-time expenses</span>
            <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 14, fontWeight: 800 }}>{formatCurrency(totalExpenses)}</span>
          </div>
        </BigCard>
        </div>

        {/* Recurring expenses */}
        <div className={financeTab === 'recurring' ? 'block lg:block' : 'hidden lg:block'}>
        <BigCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <SectionTitle sub="Rent, salaries, EMI, utilities">Monthly Fixed Costs</SectionTitle>
            <button onClick={() => { resetRecurring(); setEditingRecurring(null); setShowRecurringModal(true) }}
              className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              <Plus size={12} /> Add
            </button>
          </div>

          {/* Staff Salaries — auto-calculated, click to see the per-staff breakdown */}
          <button
            onClick={() => setSalariesExpanded(v => !v)}
            className="bg-[#EADDFF] dark:bg-[#4F378B]"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 12, marginBottom: salariesExpanded ? 0 : 6,
              width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif',
            }}>
            <div className="bg-white/60 dark:bg-[#1D192B]/60" style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={14} className="text-[#21005D] dark:text-[#EADDFF]" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-[#21005D] dark:text-[#EADDFF]" style={{ fontSize: 13, fontWeight: 700 }}>Staff Salaries</div>
              <div className="text-[#4F378B] dark:text-[#CAC4D0]" style={{ fontSize: 11, marginTop: 1 }}>
                Auto · {activeStaffForSalary.length} active staff (Team page)
              </div>
            </div>
            <span className="text-[#21005D] dark:text-[#EADDFF]" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{formatCurrency(totalStaffSalaries)}</span>
            {salariesExpanded ? <ChevronUp size={15} className="text-[#21005D] dark:text-[#EADDFF]" /> : <ChevronDown size={15} className="text-[#21005D] dark:text-[#EADDFF]" />}
          </button>

          {/* Per-staff breakdown */}
          {salariesExpanded && (
            <div className="bg-[#F8F3FC] dark:bg-[#2B2930]" style={{ borderRadius: '0 0 12px 12px', padding: '6px 10px 10px', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {activeStaffForSalary
                .slice()
                .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))
                .map(st => (
                  <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px' }}>
                    <div className="bg-[#EADDFF] dark:bg-[#4F378B] text-[#21005D] dark:text-[#EADDFF]" style={{ width: 22, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                      {st.name.charAt(0)}
                    </div>
                    <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {st.name}
                    </span>
                    <span className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 10, textTransform: 'capitalize' }}>{st.role}</span>
                    <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 12, fontWeight: 700 }}>{formatCurrency(st.salary ?? 0)}</span>
                  </div>
                ))}
              {activeStaffForSalary.length === 0 && (
                <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 12, textAlign: 'center', padding: '8px 0' }}>No active staff</div>
              )}
            </div>
          )}

          {manualRecurring.length === 0 ? (
            <div className="text-[#79747E] dark:text-[#938F99]" style={{ textAlign: 'center', padding: '12px 0', fontSize: 13 }}>No other fixed costs added yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {manualRecurring.map(r => (
                <div key={r.id} className="border border-[#F3EDF7] dark:border-[#382E48]" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderRadius: 12,
                  opacity: r.active ? 1 : 0.4
                }}>
                  <div className="bg-[#EADDFF] dark:bg-[#4F378B]" style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={14} className="text-[#21005D] dark:text-[#EADDFF]" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                    <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 11, marginTop: 1, textTransform: 'capitalize' }}>{r.category} · {r.frequency}</div>
                  </div>
                  <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{formatCurrency(r.amount)}</span>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => openEditRecurring(r)} className="text-[#CAC4D0] dark:text-[#938F99]" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={ev => (ev.currentTarget.style.color = '#6750A4')}
                      onMouseLeave={ev => (ev.currentTarget.style.color = '')}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeletingRecurringId(r.id)} className="text-[#CAC4D0] dark:text-[#938F99]" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={ev => (ev.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={ev => (ev.currentTarget.style.color = '')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-[#F3EDF7] dark:border-[#382E48]" style={{ marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-[#49454F] dark:text-[#CAC4D0]" style={{ fontSize: 12 }}>Monthly fixed costs</span>
            <span className="text-[#1D1A22] dark:text-[#E6E0E9]" style={{ fontSize: 14, fontWeight: 800 }}>{formatCurrency(monthlyRecurring)}</span>
          </div>
        </BigCard>
        </div>
      </div>

      {/* ── P&L Summary Table ──────────────────────────────────────────────── */}
      <BigCard>
        <SectionTitle sub={format(new Date(year, month - 1, 1), 'MMMM yyyy')}>Profit & Loss Summary</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {(() => {
            const rows = [
              { label: 'Total Revenue (Services)', value: revenue ?? 0, bold: false, color: '#16a34a' },
              { label: 'One-time Expenses', value: -totalExpenses, bold: false, color: '#dc2626' },
              { label: 'Staff Salaries', value: -totalStaffSalaries, bold: false, color: '#dc2626' },
              { label: 'Other Monthly Fixed Costs', value: -monthlyRecurringManual, bold: false, color: '#dc2626' },
              { label: 'Total Costs', value: -totalCosts, bold: false, color: '#dc2626', divider: true },
              { label: isProfit ? 'Net Profit' : 'Net Loss', value: grossProfit, bold: true, color: isProfit ? '#16a34a' : '#dc2626' },
            ]
            return rows.map((row, i) => (
            <div key={row.label}>
              {row.divider && <div className="bg-[#F3EDF7] dark:bg-[#382E48]" style={{ height: 1, margin: '8px 0' }} />}
              <div className={i < rows.length - 1 ? 'border-b border-[#F3EDF7] dark:border-[#382E48]' : ''} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <span className={row.bold ? 'text-[#1D1A22] dark:text-[#E6E0E9]' : 'text-[#49454F] dark:text-[#CAC4D0]'} style={{ fontSize: 13, fontWeight: row.bold ? 700 : 500 }}>
                  {row.label}
                </span>
                <span style={{ fontSize: row.bold ? 18 : 14, fontWeight: row.bold ? 800 : 600, color: row.color }}>
                  {row.value >= 0 ? '+' : ''}{formatCurrency(Math.abs(row.value))}
                  {row.value < 0 && row.label !== 'Net Loss' ? '' : ''}
                </span>
              </div>
            </div>
            ))
          })()}
        </div>
      </BigCard>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Add Expense */}
      <Modal open={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="Add Expense" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowExpenseModal(false)}>Cancel</Button>
            <Button form="exp-form" type="submit" loading={expSubmitting}>Add</Button>
          </>
        }>
        <form id="exp-form" onSubmit={handleExp(d => addExpense.mutate(d))} className="space-y-4">
          <Input label="Title" placeholder="e.g. Nail polish set" error={expErrors.title?.message} {...regExp('title')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount (₹)" type="number" step="0.01" error={expErrors.amount?.message} {...regExp('amount')} />
            <Input label="Date" type="date" error={expErrors.date?.message} {...regExp('date')} />
          </div>
          <Select label="Category" options={EXPENSE_CATEGORIES.map(c => ({ value: c, label: c }))}
            error={expErrors.category?.message} {...regExp('category')} />
          <TextArea label="Notes (optional)" {...regExp('notes')} />
        </form>
      </Modal>

      {/* Add/Edit Recurring */}
      <Modal open={showRecurringModal} onClose={() => { setShowRecurringModal(false); setEditingRecurring(null) }}
        title={editingRecurring ? 'Edit Fixed Cost' : 'Add Fixed Cost'} size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowRecurringModal(false); setEditingRecurring(null) }}>Cancel</Button>
            <Button form="rec-form" type="submit" loading={recSubmitting}>{editingRecurring ? 'Save' : 'Add'}</Button>
          </>
        }>
        <form id="rec-form" onSubmit={handleRec(d => saveRecurring.mutate(d))} className="space-y-4">
          <Input label="Title" placeholder="e.g. Shop Rent" error={recErrors.title?.message} {...regRec('title')} />
          <Input label="Amount (₹)" type="number" step="0.01" error={recErrors.amount?.message} {...regRec('amount')} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" options={RECURRING_CATEGORIES.map(c => ({ value: c, label: c }))}
              error={recErrors.category?.message} {...regRec('category')} />
            <Select label="Frequency" options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'yearly', label: 'Yearly' },
            ]} error={recErrors.frequency?.message} {...regRec('frequency')} />
          </div>
          <TextArea label="Notes (optional)" {...regRec('notes')} />
        </form>
      </Modal>

      <ConfirmModal open={!!deletingExpenseId} onClose={() => setDeletingExpenseId(null)}
        onConfirm={() => { deleteExpense.mutate(deletingExpenseId!); setDeletingExpenseId(null) }}
        title="Delete Expense" message="Are you sure?" loading={deleteExpense.isPending} />

      <ConfirmModal open={!!deletingRecurringId} onClose={() => setDeletingRecurringId(null)}
        onConfirm={() => { deleteRecurring.mutate(deletingRecurringId!); setDeletingRecurringId(null) }}
        title="Delete Fixed Cost" message="This will remove this recurring expense." loading={deleteRecurring.isPending} />

    </div>
  )
}
