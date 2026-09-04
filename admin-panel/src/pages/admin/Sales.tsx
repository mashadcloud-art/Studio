import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useStaffList } from '../../hooks/useStaff'
import {
  Receipt, Search, MessageSquare,
  Banknote, Smartphone, User, ChevronLeft, ChevronRight, Phone, Calendar, Trash2
} from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import { invalidateFinancialQueries } from '../../lib/queryInvalidation'
import { InvoiceModal } from '../../components/sales/InvoiceModal'
import type { SaleInvoiceData, InvoiceItem } from '../../components/sales/InvoiceModal'
import { ConfirmModal } from '../../components/ui/Modal'
import { format, addMonths, subMonths, addDays, subDays, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function SalesPage() {
  const [search, setSearch] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('all')
  const [viewMode, setViewMode] = useState<'all' | 'date' | 'month' | 'today'>('all')
  const [selectedDate, setSelectedDate] = useState<string>('2026-09-02') // Default to active sales date
  const [activeMonthDate, setActiveMonthDate] = useState(new Date(2026, 8, 1)) // Sep 2026

  const [selectedSale, setSelectedSale] = useState<SaleInvoiceData | null>(null)
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false)
  const [deletingSale, setDeletingSale] = useState<SaleInvoiceData | null>(null)

  const qc = useQueryClient()

  const deleteSaleMutation = useMutation({
    mutationFn: async (sale: SaleInvoiceData) => {
      // Delete EVERY underlying row this invoice represents. `sale.id` is a
      // display-only key like "wr-<uuid>" or "bk-<uuid>" — deleting with it
      // directly against the real uuid `id` column never matches any row
      // (and the old code didn't check for that error), so nothing actually
      // got deleted even though the toast said it did. A merged invoice
      // (e.g. one visit split across two stylists) can also represent more
      // than one row, so every id in sourceIds must be deleted, not just one.
      const sources = sale.sourceIds?.length
        ? sale.sourceIds
        : [{ table: sale.id.startsWith('bk-') ? ('bookings' as const) : ('work_records' as const), id: sale.id.replace(/^(wr|bk)-/, '') }]

      for (const src of sources) {
        const { error } = await db.from(src.table).delete().eq('id', src.id)
        if (error) throw error
      }
    },
    // Deleting an invoice touches revenue, cash, payment collection, payroll
    // and every dashboard/report screen that summarizes it —
    // invalidateFinancialQueries clears all of them together in one place,
    // instead of this screen having to hand-pick keys and inevitably miss
    // the one screen (Finance's P&L, Payment Collection's cash totals, a
    // staff member's own monthly report) that wasn't being looked at here.
    onSuccess: () => {
      invalidateFinancialQueries(qc)
      toast.success('Sale record completely deleted!')
      setDeletingSale(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { data: staffList = [] } = useStaffList()

  // 1. Fetch work records
  const { data: workRecords = [], isLoading: loadingWork } = useQuery({
    queryKey: ['sales_work_records'],
    queryFn: async () => {
      const { data, error } = await db
        .from('work_records')
        .select(`
          id,
          date,
          start_time,
          amount,
          payment_method,
          notes,
          created_at,
          extra_services,
          staff:staff_id(id, name, phone),
          customers:customer_id(id, name, phone),
          services:service_id(id, name, price, category)
        `)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        console.error('work_records fetch error:', error)
        return []
      }
      return data ?? []
    },
  })

  // 2. Fetch completed bookings
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['sales_bookings'],
    queryFn: async () => {
      const { data, error } = await db
        .from('bookings')
        .select(`
          id,
          customer_name,
          customer_phone,
          booking_date,
          booking_time,
          services,
          advance_paid,
          pending_amount,
          payment_method,
          payment_status,
          created_at,
          staff:assigned_staff_id(id, name, phone)
        `)
        .eq('status', 'completed')
        .order('booking_date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        console.error('bookings fetch error:', error)
        return []
      }
      return data ?? []
    },
  })

  // Unify and standardize into a single list of Sales
  const allSales: SaleInvoiceData[] = useMemo(() => {
    const rawList: {
      id: string
      date: string
      customerName: string
      customerPhone: string
      staffName: string
      services: InvoiceItem[]
      grossAmount: number
      discountAmount: number
      totalAmount: number
      paymentMethod: string
      notes?: string
      sourceIds: { table: 'work_records' | 'bookings'; id: string }[]
    }[] = []

    // Map work records
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workRecords.forEach((wr: any) => {
      const items: InvoiceItem[] = []
      if (wr.services?.name) {
        items.push({
          name: wr.services.name,
          price: Number(wr.services.price) || Number(wr.amount) || 0,
        })
      }

      if (Array.isArray(wr.extra_services)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wr.extra_services.forEach((extra: any) => {
          if (extra?.name) {
            items.push({
              name: extra.name,
              price: Number(extra.price) || 0,
            })
          }
        })
      }

      const totalAmount = Number(wr.amount) || 0
      rawList.push({
        id: `wr-${wr.id}`,
        date: wr.date || '2026-09-01',
        customerName: wr.customers?.name || 'Walk-in Client',
        customerPhone: wr.customers?.phone || '',
        staffName: wr.staff?.name || 'Stylist',
        services: items.length > 0 ? items : [{ name: 'Salon Service', price: totalAmount }],
        grossAmount: totalAmount,
        discountAmount: 0,
        totalAmount,
        paymentMethod: wr.payment_method || 'gpay',
        notes: wr.notes,
        sourceIds: [{ table: 'work_records', id: wr.id }],
      })
    })

    // Map bookings and enrich work records with full itemized services breakdown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookings.forEach((b: any) => {
      const custName = (b.customer_name || '').toLowerCase().trim()

      const items: InvoiceItem[] = []
      if (Array.isArray(b.services)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        b.services.forEach((s: any) => {
          items.push({
            name: s.name || 'Service',
            price: Number(s.price) || 0,
          })
        })
      }

      // If already present in rawList on same date, enrich its itemized services
      const existing = rawList.find(
        r => r.customerName.toLowerCase().trim() === custName && r.date === b.booking_date
      )
      if (existing) {
        if (items.length > existing.services.length) {
          existing.services = items
        }
        if ((!existing.customerPhone || existing.customerPhone === '0000000000') && b.customer_phone) {
          existing.customerPhone = b.customer_phone
        }
        // This booking's row still needs to be deleted along with the work
        // record when the invoice is deleted — otherwise it survives as an
        // orphaned "completed" booking that keeps counting toward totals.
        existing.sourceIds.push({ table: 'bookings', id: b.id })
        return
      }

      const itemsSum = items.reduce((sum, i) => sum + i.price, 0)
      const totalAmount = Number(b.pending_amount) > 0 ? Number(b.pending_amount) : itemsSum

      rawList.push({
        id: `bk-${b.id}`,
        date: b.booking_date || '2026-09-01',
        customerName: b.customer_name || 'Client',
        customerPhone: b.customer_phone || '',
        staffName: b.staff?.name || 'Staff',
        services: items.length > 0 ? items : [{ name: 'Salon Service', price: totalAmount }],
        grossAmount: totalAmount,
        discountAmount: 0,
        totalAmount,
        paymentMethod: b.payment_method || 'gpay',
        sourceIds: [{ table: 'bookings', id: b.id }],
      })
    })

    // Group & merge multiple entries for the same customer on the same date (e.g. Chithra with services across multiple staff)
    const groupedMap = new Map<string, typeof rawList[0]>()

    rawList.forEach(item => {
      const key = `${item.customerName.toLowerCase().trim()}_${item.date}`
      const existing = groupedMap.get(key)
      if (!existing) {
        groupedMap.set(key, { ...item, services: [...item.services], sourceIds: [...item.sourceIds] })
      } else {
        // Merge stylists if different (e.g. NIMISHA & SANIYA)
        const staffParts = [
          ...existing.staffName.split('&').map(s => s.trim()),
          ...item.staffName.split('&').map(s => s.trim()),
        ].filter(Boolean)
        existing.staffName = Array.from(new Set(staffParts)).join(' & ')

        // Merge services
        existing.services.push(...item.services)

        // Sum amounts
        existing.grossAmount += item.grossAmount
        existing.discountAmount += item.discountAmount
        existing.totalAmount += item.totalAmount

        // Keep every underlying row so deleting this merged invoice removes all of them
        existing.sourceIds.push(...item.sourceIds)
      }
    })

    const mergedList = Array.from(groupedMap.values())

    // Sort chronologically ascending to assign sequential invoice numbers
    mergedList.sort((a, b) => a.date.localeCompare(b.date))

    // Assign sequential invoice numbers: INV-001, INV-002, etc.
    const numberedSales: SaleInvoiceData[] = mergedList.map((item, index) => {
      const invoiceNumber = `INV-${String(index + 1).padStart(3, '0')}`
      return {
        ...item,
        invoiceNumber,
      }
    })

    // "Last invoice first" -> Return in descending order (highest invoice number / newest date first)
    return numberedSales.reverse()
  }, [workRecords, bookings])

  // Filtered sales
  const filteredSales = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const selectedMonth = format(activeMonthDate, 'yyyy-MM')

    return allSales.filter(s => {
      // Search
      const q = search.toLowerCase().trim()
      if (q) {
        const matchesName = s.customerName.toLowerCase().includes(q)
        const matchesPhone = s.customerPhone.includes(q)
        const matchesInv = s.invoiceNumber.toLowerCase().includes(q)
        const matchesService = s.services.some(svc => svc.name.toLowerCase().includes(q))
        if (!matchesName && !matchesPhone && !matchesInv && !matchesService) return false
      }

      // Staff filter
      if (selectedStaff !== 'all' && !s.staffName.toLowerCase().includes(selectedStaff.toLowerCase())) {
        return false
      }

      // Payment Mode filter
      if (selectedPaymentMode !== 'all') {
        const pMode = s.paymentMethod?.toLowerCase() || ''
        if (selectedPaymentMode === 'gpay' && !pMode.includes('gpay') && !pMode.includes('upi') && !pMode.includes('bank')) {
          return false
        }
        if (selectedPaymentMode === 'cash' && !pMode.includes('cash')) {
          return false
        }
        if (selectedPaymentMode === 'card' && !pMode.includes('card')) {
          return false
        }
      }

      // View Mode Filter
      if (viewMode === 'today' && s.date !== today) return false
      if (viewMode === 'date' && s.date !== selectedDate) return false
      if (viewMode === 'month' && !s.date.startsWith(selectedMonth)) return false

      return true
    })
  }, [allSales, search, selectedStaff, selectedPaymentMode, viewMode, selectedDate, activeMonthDate])

  // Summary Metrics
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0)
  const gpayTotal = filteredSales
    .filter(s => {
      const m = s.paymentMethod?.toLowerCase() || ''
      return m.includes('gpay') || m.includes('upi') || m.includes('bank')
    })
    .reduce((sum, s) => sum + s.totalAmount, 0)
  const cashTotal = filteredSales
    .filter(s => (s.paymentMethod?.toLowerCase() || '').includes('cash'))
    .reduce((sum, s) => sum + s.totalAmount, 0)

  const openInvoice = (sale: SaleInvoiceData) => {
    setSelectedSale(sale)
    setIsInvoiceOpen(true)
  }

  const openWhatsApp = (sale: SaleInvoiceData) => {
    if (!sale.customerPhone || sale.customerPhone === '0000000000') {
      toast.error('No phone number recorded for this customer')
      return
    }

    let cleanPhone = sale.customerPhone.replace(/[^0-9]/g, '')
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone

    const servicesList = sale.services
      .map(s => `• ${s.name}: ${formatCurrency(s.price)}`)
      .join('\n')

    const message = `✨ *NAILUXE STUDIO — INVOICE* ✨
━━━━━━━━━━━━━━━━━━━━
📄 *Invoice #:* ${sale.invoiceNumber}
📅 *Date:* ${formatDate(sale.date)}
👤 *Customer:* ${sale.customerName}
💅 *Staff / Stylist:* ${sale.staffName}

*Services Provided:*
${servicesList}
${sale.discountAmount > 0 ? `\n🏷️ *Discount:* -${formatCurrency(sale.discountAmount)}` : ''}
━━━━━━━━━━━━━━━━━━━━
💰 *Total Paid:* *${formatCurrency(sale.totalAmount)}*
💳 *Payment Mode:* ${sale.paymentMethod?.toUpperCase() || 'PAID'}
━━━━━━━━━━━━━━━━━━━━
Thank you for visiting *Nailuxe Studio*! 💅✨`

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  const isLoading = loadingWork || loadingBookings

  return (
    <div className="max-w-full space-y-4 sm:space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-2">
            <Receipt className="text-[#6750A4] dark:text-[#D0BCFF]" size={24} />
            Sales & Invoices
          </h1>
          <p className="text-[11px] sm:text-xs text-[#79747E] dark:text-[#938F99] mt-0.5">
            Showing all customer invoices (last invoice first) with WhatsApp and PDF export
          </p>
        </div>

        {/* View Mode Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* Month Stepper */}
          {viewMode === 'month' && (
            <div className="flex items-center justify-between sm:justify-start gap-1 bg-[#F3EDF7] dark:bg-[#2B2930] p-1 rounded-xl border border-[#E8DEF8] dark:border-[#382E48]">
              <button
                onClick={() => setActiveMonthDate(prev => subMonths(prev, 1))}
                className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-black/30 text-[#49454F] dark:text-[#CAC4D0]"
                title="Previous Month">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold px-2 text-[#1D1A22] dark:text-[#E6E0E9]">
                {format(activeMonthDate, 'MMMM yyyy')}
              </span>
              <button
                onClick={() => setActiveMonthDate(prev => addMonths(prev, 1))}
                className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-black/30 text-[#49454F] dark:text-[#CAC4D0]"
                title="Next Month">
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Specific Date Stepper */}
          {viewMode === 'date' && (
            <div className="flex items-center justify-between sm:justify-start gap-1 bg-[#F3EDF7] dark:bg-[#2B2930] p-1 rounded-xl border border-[#E8DEF8] dark:border-[#382E48]">
              <button
                onClick={() => setSelectedDate(prev => format(subDays(parseISO(prev), 1), 'yyyy-MM-dd'))}
                className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-black/30 text-[#49454F] dark:text-[#CAC4D0]"
                title="Previous Day">
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1.5 px-2">
                <Calendar size={13} className="text-[#6750A4] dark:text-[#D0BCFF] shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9] focus:outline-none cursor-pointer"
                />
              </div>
              <button
                onClick={() => setSelectedDate(prev => format(addDays(parseISO(prev), 1), 'yyyy-MM-dd'))}
                className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-black/30 text-[#49454F] dark:text-[#CAC4D0]"
                title="Next Day">
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 sm:flex sm:items-center gap-1 p-1 bg-[#F3EDF7] dark:bg-[#2B2930] rounded-xl border border-[#E8DEF8] dark:border-[#382E48] text-xs font-semibold">
            <button
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors text-center truncate ${
                viewMode === 'all'
                  ? 'bg-[#6750A4] text-white font-bold shadow-2xs'
                  : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-white/50'
              }`}>
              All ({allSales.length})
            </button>
            <button
              onClick={() => setViewMode('date')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors text-center truncate ${
                viewMode === 'date'
                  ? 'bg-[#6750A4] text-white font-bold shadow-2xs'
                  : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-white/50'
              }`}>
              By Date
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors text-center truncate ${
                viewMode === 'month'
                  ? 'bg-[#6750A4] text-white font-bold shadow-2xs'
                  : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-white/50'
              }`}>
              By Month
            </button>
            <button
              onClick={() => setViewMode('today')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors text-center truncate ${
                viewMode === 'today'
                  ? 'bg-[#6750A4] text-white font-bold shadow-2xs'
                  : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-white/50'
              }`}>
              Today
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white dark:bg-[#1D192B] p-3 sm:p-4 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
          <div className="text-[10px] sm:text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider">
            Total Revenue
          </div>
          <div className="text-lg sm:text-2xl font-black text-[#1D1A22] dark:text-[#E6E0E9] mt-1 tracking-tight truncate">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5">
            {filteredSales.length} invoice{filteredSales.length !== 1 ? 's' : ''} listed
          </div>
        </div>

        <div className="bg-white dark:bg-[#1D192B] p-3 sm:p-4 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
          <div className="text-[10px] sm:text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider flex items-center gap-1 truncate">
            <Smartphone size={12} className="text-blue-500 shrink-0" /> GPay / Online
          </div>
          <div className="text-lg sm:text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 tracking-tight truncate">
            {formatCurrency(gpayTotal)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5">Direct to Bank</div>
        </div>

        <div className="bg-white dark:bg-[#1D192B] p-3 sm:p-4 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
          <div className="text-[10px] sm:text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider flex items-center gap-1 truncate">
            <Banknote size={12} className="text-green-600 shrink-0" /> Cash Collected
          </div>
          <div className="text-lg sm:text-2xl font-black text-green-600 dark:text-green-400 mt-1 tracking-tight truncate">
            {formatCurrency(cashTotal)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5">Cash in hand</div>
        </div>

        <div className="bg-white dark:bg-[#1D192B] p-3 sm:p-4 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
          <div className="text-[10px] sm:text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider">
            Avg Ticket
          </div>
          <div className="text-lg sm:text-2xl font-black text-[#6750A4] dark:text-[#D0BCFF] mt-1 tracking-tight truncate">
            {formatCurrency(filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5">Per invoice</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3 bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79747E]" />
          <input
            type="text"
            placeholder="Search customer, phone, invoice #, service..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] text-[#1D1A22] dark:text-[#E6E0E9] focus:outline-none focus:ring-2 focus:ring-[#6750A4]"
          />
        </div>

        <div className="grid grid-cols-3 sm:flex sm:items-center gap-2">
          {/* Quick Date Picker */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] text-[#1D1A22] dark:text-[#E6E0E9]">
            <Calendar size={13} className="text-[#6750A4] dark:text-[#D0BCFF] shrink-0" />
            <input
              type="date"
              value={viewMode === 'date' ? selectedDate : ''}
              onChange={e => {
                if (e.target.value) {
                  setSelectedDate(e.target.value)
                  setViewMode('date')
                } else {
                  setViewMode('all')
                }
              }}
              title="Filter by specific date"
              className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer w-full sm:w-28"
            />
          </div>

          {/* Staff Filter */}
          <select
            value={selectedStaff}
            onChange={e => setSelectedStaff(e.target.value)}
            className="w-full px-2.5 py-2 rounded-xl text-xs bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] text-[#1D1A22] dark:text-[#E6E0E9] font-medium">
            <option value="all">All Stylists</option>
            {staffList.map(s => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Payment Method Filter */}
          <select
            value={selectedPaymentMode}
            onChange={e => setSelectedPaymentMode(e.target.value)}
            className="w-full px-2.5 py-2 rounded-xl text-xs bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] text-[#1D1A22] dark:text-[#E6E0E9] font-medium">
            <option value="all">All Modes</option>
            <option value="gpay">GPay / Online</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
          </select>
        </div>
      </div>

      {/* Sales Transactions Content */}
      {isLoading ? (
        <div className="text-center py-20 bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
          <div className="w-8 h-8 border-2 border-[#E8DEF8] border-t-[#6750A4] rounded-full animate-spin mx-auto" />
          <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-3 font-medium">Loading sales invoices...</p>
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] px-4">
          <Receipt size={40} className="text-[#CAC4D0] mx-auto mb-3" />
          <h3 className="text-sm font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
            {viewMode === 'date'
              ? `No invoices recorded on ${formatDate(selectedDate)}`
              : 'No sales invoices found for this selection'}
          </h3>
          <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-1 max-w-md mx-auto">
            {viewMode === 'date'
              ? 'Try using the date arrows or switch to "All Invoices" to view all records.'
              : 'Try clicking "All Invoices" to view all transactions, or adjust your search filters.'}
          </p>
          <button
            onClick={() => {
              setViewMode('all')
              setSelectedStaff('all')
              setSelectedPaymentMode('all')
              setSearch('')
            }}
            className="mt-4 px-4 py-2 bg-[#6750A4] hover:bg-[#523C8A] text-white rounded-xl text-xs font-bold transition-colors">
            Show All Invoices ({allSales.length} Total)
          </button>
        </div>
      ) : (
        <>
          {/* ============================================================== */}
          {/* MOBILE VIEW (< md): Touch-friendly sales cards                 */}
          {/* ============================================================== */}
          <div className="block md:hidden space-y-3">
            {filteredSales.map(sale => (
              <div
                key={sale.id}
                className="bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] p-4 shadow-2xs space-y-3">
                {/* Header: Invoice #, Date, Amount, Payment Badge */}
                <div className="flex items-start justify-between gap-2 border-b border-[#E8DEF8] dark:border-[#382E48] pb-2.5">
                  <div>
                    <span className="font-black text-sm text-[#6750A4] dark:text-[#D0BCFF]">
                      {sale.invoiceNumber}
                    </span>
                    <div className="text-[11px] text-[#79747E] dark:text-[#938F99] mt-0.5">
                      {formatDate(sale.date)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-black text-base text-[#1D1A22] dark:text-[#E6E0E9]">
                      {formatCurrency(sale.totalAmount)}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                        (sale.paymentMethod?.toLowerCase() || '').includes('gpay')
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                      }`}>
                      {(sale.paymentMethod?.toLowerCase() || '').includes('gpay') ? (
                        <Smartphone size={10} />
                      ) : (
                        <Banknote size={10} />
                      )}
                      {sale.paymentMethod?.toUpperCase() || 'PAID'}
                    </span>
                  </div>
                </div>

                {/* Customer & Stylist */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-[#79747E] dark:text-[#938F99] block">
                      Customer
                    </span>
                    <span className="font-extrabold text-sm text-[#1D1A22] dark:text-[#E6E0E9] block truncate">
                      {sale.customerName}
                    </span>
                    {sale.customerPhone && sale.customerPhone !== '0000000000' && (
                      <span className="text-[11px] text-[#79747E] dark:text-[#938F99] flex items-center gap-1">
                        <Phone size={10} /> {sale.customerPhone}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-[#79747E] dark:text-[#938F99] block">
                      Stylist / Staff
                    </span>
                    <span className="font-bold text-xs text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-1">
                      <User size={12} className="text-[#6750A4] shrink-0" />
                      <span className="truncate">{sale.staffName}</span>
                    </span>
                  </div>
                </div>

                {/* Services Chips */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#79747E] dark:text-[#938F99] block mb-1.5">
                    Services ({sale.services.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {sale.services.map((svc, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0] border border-[#E8DEF8] dark:border-[#382E48]">
                        <span>{svc.name}</span>
                        <span className="font-bold text-[#6750A4] dark:text-[#D0BCFF]">
                          {formatCurrency(svc.price)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Big Mobile Touch Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#E8DEF8] dark:border-[#382E48]">
                  <button
                    onClick={() => openInvoice(sale)}
                    className="w-full py-2.5 bg-[#6750A4] hover:bg-[#523C8A] active:scale-[0.98] text-white rounded-xl font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs transition-all">
                    <Receipt size={14} /> View Invoice
                  </button>

                  <button
                    onClick={() => openWhatsApp(sale)}
                    className="w-full py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] active:scale-[0.98] text-white rounded-xl font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs transition-all">
                    <MessageSquare size={14} /> WhatsApp
                  </button>

                  <button
                    onClick={() => setDeletingSale(sale)}
                    className="col-span-2 w-full py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors">
                    <Trash2 size={13} /> Delete Sale Record
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ============================================================== */}
          {/* DESKTOP VIEW (>= md): Clean Data Table                         */}
          {/* ============================================================== */}
          <div className="hidden md:block bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#ECE6F0] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0] font-bold border-b border-[#E8DEF8] dark:border-[#382E48]">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Stylist</th>
                    <th className="py-3 px-4">Services Provided</th>
                    <th className="py-3 px-4 text-right">Total Paid</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DEF8] dark:divide-[#382E48]">
                  {filteredSales.map(sale => (
                    <tr key={sale.id} className="hover:bg-[#F9F7FA] dark:hover:bg-[#25222E] transition-colors">
                      {/* Invoice # */}
                      <td className="py-3 px-4 font-black text-[#6750A4] dark:text-[#D0BCFF]">
                        {sale.invoiceNumber}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 text-[#49454F] dark:text-[#CAC4D0] whitespace-nowrap">
                        {formatDate(sale.date)}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-extrabold text-[#1D1A22] dark:text-[#E6E0E9]">{sale.customerName}</div>
                        <div className="text-[11px] text-[#79747E] dark:text-[#938F99]">
                          {sale.customerPhone || 'No phone'}
                        </div>
                      </td>

                      {/* Stylist */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
                          <User size={12} className="text-[#6750A4]" />
                          {sale.staffName}
                        </span>
                      </td>

                      {/* Services */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[340px]">
                          {sale.services.map((svc, i) => (
                            <span
                              key={i}
                              className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F3EDF7] dark:bg-[#382E48] text-[#49454F] dark:text-[#CAC4D0]">
                              {svc.name}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-black text-sm text-[#1D1A22] dark:text-[#E6E0E9]">
                          {formatCurrency(sale.totalAmount)}
                        </div>
                        {sale.discountAmount > 0 && (
                          <div className="text-[10px] text-red-600 dark:text-red-400 font-semibold">
                            disc: -{formatCurrency(sale.discountAmount)}
                          </div>
                        )}
                      </td>

                      {/* Payment Mode */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            (sale.paymentMethod?.toLowerCase() || '').includes('gpay')
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          }`}>
                          {(sale.paymentMethod?.toLowerCase() || '').includes('gpay') ? (
                            <Smartphone size={12} />
                          ) : (
                            <Banknote size={12} />
                          )}
                          {sale.paymentMethod?.toUpperCase() || 'PAID'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openInvoice(sale)}
                            className="px-2.5 py-1.5 bg-[#6750A4] hover:bg-[#523C8A] text-white rounded-lg font-bold text-xs inline-flex items-center gap-1 shadow-2xs transition-colors"
                            title="View and Print Invoice">
                            <Receipt size={13} /> Invoice
                          </button>

                          <button
                            onClick={() => openWhatsApp(sale)}
                            className="p-1.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-lg transition-colors"
                            title="Send receipt to customer via WhatsApp">
                            <MessageSquare size={14} />
                          </button>

                          <button
                            onClick={() => setDeletingSale(sale)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                            title="Delete sale record permanently">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Invoice Modal Component */}
      <InvoiceModal
        open={isInvoiceOpen}
        onClose={() => setIsInvoiceOpen(false)}
        sale={selectedSale}
      />

      {/* Delete Sale Confirmation Modal */}
      <ConfirmModal
        open={!!deletingSale}
        onClose={() => setDeletingSale(null)}
        onConfirm={() => {
          if (deletingSale) deleteSaleMutation.mutate(deletingSale)
        }}
        title="Delete Sale Record"
        message={`Are you sure you want to permanently delete this sale for "${deletingSale?.customerName}" (${formatCurrency(deletingSale?.totalAmount ?? 0)})? This will remove it from all sales logs, reports, and revenue totals.`}
        confirmLabel="Delete Sale"
        loading={deleteSaleMutation.isPending}
      />
    </div>
  )
}
