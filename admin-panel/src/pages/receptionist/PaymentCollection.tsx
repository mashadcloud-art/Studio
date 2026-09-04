import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Banknote, CreditCard, Smartphone, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { formatCurrency, formatDate } from '../../lib/utils'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { Modal } from '../../components/ui/Modal'
import { invalidateFinancialQueries } from '../../lib/queryInvalidation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type PaymentMethod = 'cash' | 'card' | 'gpay' | 'upi' | 'other'

interface PendingPayment {
  id: string
  customer_name: string
  customer_phone: string
  customer_place: string | null
  booking_date: string
  booking_time: string
  services: { name: string; price: number }[]
  advance_paid: number
  pending_amount: number
  payment_status: 'unpaid' | 'paid'
  payment_method: string | null
  status: string
  staff?: { id: string; name: string }
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: React.ReactNode; sub: string; dest: string }[] = [
  { id: 'cash',  label: 'Cash',  icon: <Banknote size={20} />,   sub: '→ Cash in Hand', dest: 'cash'  },
  { id: 'gpay',  label: 'GPay',  icon: <Smartphone size={20} />, sub: '→ Bank Account', dest: 'bank'  },
  { id: 'upi',   label: 'UPI',   icon: <Smartphone size={20} />, sub: '→ Bank Account', dest: 'bank'  },
  { id: 'card',  label: 'Card',  icon: <CreditCard size={20} />, sub: '→ Bank Account', dest: 'bank'  },
  { id: 'other', label: 'Other', icon: <Banknote size={20} />,   sub: '→ Specify',      dest: 'other' },
]

export function PaymentCollection() {
  const { staff } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const c = {
    border: isDark ? '#382E48' : '#E8DEF8',
    surface: isDark ? '#1D192B' : 'white',
    surfaceVariant: isDark ? '#2B2930' : '#F3EDF7',
    surfaceVariantText: isDark ? '#CAC4D0' : '#49454F',
    text: isDark ? '#E6E0E9' : '#1D1A22',
    muted: isDark ? '#CAC4D0' : '#79747E',
    muted2: isDark ? '#CAC4D0' : '#938F99',
    primary: isDark ? '#D0BCFF' : '#6750A4',
    onPrimary: isDark ? '#381E72' : 'white',
    successBg: isDark ? '#003913' : '#f0fdf4',
    successBorder: isDark ? 'rgba(121,223,132,0.3)' : '#bbf7d0',
    successText: isDark ? '#79DF84' : '#16a34a',
    successTextStrong: isDark ? '#79DF84' : '#15803d',
    infoBg: isDark ? '#003355' : '#eff6ff',
    infoBorder: isDark ? 'rgba(156,180,204,0.3)' : '#bfdbfe',
    infoText: isDark ? '#9CB4CC' : '#2563eb',
    infoTextStrong: isDark ? '#9CB4CC' : '#1d4ed8',
    warningBg: isDark ? '#3D2E00' : '#fffbeb',
    warningBorder: isDark ? 'rgba(251,192,45,0.3)' : '#fef3c7',
    warningText: isDark ? '#FBC02D' : '#d97706',
  }
  const qc = useQueryClient()
  const [selectedBooking, setSelectedBooking] = useState<PendingPayment | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cash')

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['payment_pending'],
    queryFn: async () => {
      const { data, error } = await db.from('bookings')
        .select('*, staff:assigned_staff_id(id, name)')
        .neq('status', 'cancelled')
        .eq('payment_status', 'unpaid')
        .gt('pending_amount', 0)
        .order('booking_date', { ascending: false })
        .order('booking_time', { ascending: false })
      if (error) throw error
      return data as PendingPayment[]
    },
    refetchInterval: 10000, // refresh every 10s
  })

  const { data: collected = [] } = useQuery({
    queryKey: ['payment_collected_today'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data, error } = await db.from('bookings')
        .select('*, staff:assigned_staff_id(id, name)')
        .eq('status', 'completed')
        .eq('payment_status', 'paid')
        .gte('payment_collected_at', `${today}T00:00:00`)
        .order('payment_collected_at', { ascending: false })
      if (error) throw error
      return data as (PendingPayment & { payment_collected_at: string })[]
    },
  })

  const collectPayment = useMutation({
    mutationFn: async ({ bookingId, method, amount }: { bookingId: string; method: PaymentMethod; amount: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db as any).functions.invoke('collect-payment', {
        body: { bookingId, method, collectedBy: staff?.id, amount },
      })
      if (error || data?.error) throw new Error(error?.message ?? data?.error)
    },
    onSuccess: () => {
      // Collecting a payment moves money too — keep it in step with every
      // other screen that summarizes revenue/cash, not just this page's own
      // two lists.
      invalidateFinancialQueries(qc)
      qc.invalidateQueries({ queryKey: ['cash_settings'] })
      toast.success('Payment collected! ✅')
      setSelectedBooking(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const todayCashTotal = collected
    .filter(b => b.payment_method === 'cash')
    .reduce((s, b) => s + b.pending_amount + b.advance_paid, 0)

  const todayBankTotal = collected
    .filter(b => b.payment_method !== 'cash')
    .reduce((s, b) => s + b.pending_amount + b.advance_paid, 0)

  return (
    <div style={{ maxWidth: '100%' }} className="space-y-5">

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: '-0.5px' }}>
          Payment Collection
        </h1>
        <p style={{ fontSize: 13, color: c.muted, marginTop: 3 }}>
          Collect payments from completed sessions
        </p>
      </div>

      {/* Today's collection summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Awaiting Payment', value: pending.length, sub: 'sessions', color: c.warningText, bg: c.warningBg },
          { label: 'Cash Collected Today', value: formatCurrency(todayCashTotal), sub: 'cash in hand', color: c.successText, bg: c.successBg },
          { label: 'Bank Collected Today', value: formatCurrency(todayBankTotal), sub: 'card / gpay / upi', color: c.infoText, bg: c.infoBg },
        ].map(stat => (
          <div key={stat.label} style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`, padding: '18px 20px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, letterSpacing: '-0.5px' }}>{stat.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.text, marginTop: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 11, color: c.muted2, marginTop: 2 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Pending payments */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} color={c.warningText} />
          Awaiting Payment ({pending.length})
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ width: 24, height: 24, border: `2px solid ${c.border}`, borderTopColor: c.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : pending.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`, color: c.muted2, fontSize: 13 }}>
            <CheckCircle2 size={36} style={{ margin: '0 auto 10px', color: isDark ? '#003913' : '#d1fae5' }} />
            All payments collected!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(b => {
              const total = b.pending_amount
              const servicesText = b.services.map(s => s.name).join(', ')
              return (
                <div key={b.id} style={{ background: c.surface, borderRadius: 14, border: `2px solid ${c.warningBorder}`, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      {/* Customer + Staff */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: c.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.onPrimary, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                          {b.customer_name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>{b.customer_name}</div>
                          <div style={{ fontSize: 11, color: c.muted }}>
                            📞 {b.customer_phone}
                            {b.staff && <> · Done by <strong>{b.staff.name}</strong></>}
                          </div>
                        </div>
                      </div>

                      {/* Services */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        {b.services.map((s, i) => (
                          <span key={i} style={{ padding: '3px 10px', background: c.surfaceVariant, borderRadius: 99, fontSize: 11, fontWeight: 600, color: c.surfaceVariantText }}>
                            {s.name} · {formatCurrency(s.price)}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Amount */}
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                      {b.advance_paid > 0 && (
                        <div style={{ fontSize: 11, color: c.muted2, marginBottom: 2 }}>
                          Advance: {formatCurrency(b.advance_paid)} paid
                        </div>
                      )}
                      <div style={{ fontSize: 22, fontWeight: 900, color: c.warningText }}>
                        {formatCurrency(total)}
                      </div>
                      <div style={{ fontSize: 10, color: c.muted2 }}>pending</div>
                    </div>
                  </div>

                  {/* Collect Payment Button */}
                  <button
                    onClick={() => { setSelectedBooking(b); setSelectedMethod('cash') }}
                    style={{
                      width: '100%', marginTop: 14,
                      padding: '11px', borderRadius: 10, border: 'none',
                      background: c.primary, color: c.onPrimary, fontSize: 13,
                      fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}>
                    <Banknote size={14} /> Collect Payment
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Collected today */}
      {collected.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color={c.successText} />
            Collected Today ({collected.length})
          </div>
          <div style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
            {collected.map((b, i) => {
              const isCash = b.payment_method === 'cash'
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderBottom: i < collected.length - 1 ? `1px solid ${c.border}` : 'none'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{b.customer_name}</div>
                    <div style={{ fontSize: 11, color: c.muted }}>
                      {b.services.map(s => s.name).join(', ')}
                      {b.staff && ` · ${b.staff.name}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>
                      {formatCurrency(b.pending_amount)}
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                      background: isCash ? c.successBg : c.infoBg,
                      color: isCash ? c.successText : c.infoText
                    }}>
                      {isCash ? <Banknote size={9} /> : <Smartphone size={9} />}
                      {(b.payment_method ?? 'cash').toUpperCase()} · {isCash ? 'Cash' : 'Bank'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <Modal
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        title={`Collect Payment — ${selectedBooking?.customer_name}`}
        size="sm"
        footer={
          <>
            <button onClick={() => setSelectedBooking(null)}
              style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${c.border}`, background: c.surface, fontSize: 13, fontWeight: 600, color: c.muted, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Cancel
            </button>
            <button
              onClick={() => selectedBooking && collectPayment.mutate({ bookingId: selectedBooking.id, method: selectedMethod, amount: selectedBooking.pending_amount })}
              disabled={collectPayment.isPending}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: c.primary, color: c.onPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: collectPayment.isPending ? 0.6 : 1 }}>
              {collectPayment.isPending ? 'Processing...' : 'Confirm Payment'}
            </button>
          </>
        }
      >
        {selectedBooking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Amount */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: c.surfaceVariant, borderRadius: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: c.muted }}>Amount to collect</div>
                {selectedBooking.advance_paid > 0 && (
                  <div style={{ fontSize: 11, color: c.successText, marginTop: 2 }}>
                    ✓ Advance {formatCurrency(selectedBooking.advance_paid)} already paid
                  </div>
                )}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: c.text }}>
                {formatCurrency(selectedBooking.pending_amount)}
              </div>
            </div>

            {/* Payment method selector */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Payment Method
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PAYMENT_OPTIONS.map(pm => {
                  const isSelected = selectedMethod === pm.id
                  return (
                    <button key={pm.id} type="button" onClick={() => setSelectedMethod(pm.id)}
                      style={{
                        padding: '10px 4px', borderRadius: 10,
                        border: `2px solid ${isSelected ? c.primary : c.border}`,
                        background: isSelected ? c.primary : c.surface,
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
                      }}>
                      <span style={{ color: isSelected ? c.onPrimary : c.muted }}>{pm.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? c.onPrimary : c.text }}>{pm.label}</span>
                      <span style={{ fontSize: 9, color: isSelected ? (isDark ? 'rgba(56,30,114,0.6)' : 'rgba(255,255,255,0.5)') : c.muted2, textAlign: 'center', lineHeight: 1.2 }}>{pm.sub}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Destination indicator */}
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: selectedMethod === 'cash' ? c.successBg : c.infoBg,
              border: `1px solid ${selectedMethod === 'cash' ? c.successBorder : c.infoBorder}`,
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              {selectedMethod === 'cash'
                ? <Banknote size={15} color={c.successText} />
                : <Smartphone size={15} color={c.infoText} />}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: selectedMethod === 'cash' ? c.successTextStrong : c.infoTextStrong }}>
                  {selectedMethod === 'cash' ? 'Goes to Cash in Hand' : `Goes to Bank Account (${selectedMethod.toUpperCase()})`}
                </div>
                <div style={{ fontSize: 11, color: selectedMethod === 'cash' ? '#4ade80' : '#60a5fa', marginTop: 1 }}>
                  {formatCurrency(selectedBooking.pending_amount)} will be added to {selectedMethod === 'cash' ? 'cash balance' : 'bank balance'}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
