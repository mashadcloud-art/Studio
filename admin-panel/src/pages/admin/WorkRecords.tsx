import { useState } from 'react'
import { Download, Eye, Trash2, Clock, Banknote, Smartphone, CreditCard } from 'lucide-react'
import { useWorkRecords, useDeleteWorkRecord } from '../../hooks/useWorkRecords'
import { useStaffList } from '../../hooks/useStaff'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { formatDate, formatCurrency, formatCurrencyPDF, formatTime, calculateDuration, getTodayString } from '../../lib/utils'
import type { WorkRecordWithRelations } from '../../types/database'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export function WorkRecordsPage() {
  const today = getTodayString()
  const [filters, setFilters] = useState({ staffId: '', startDate: today, endDate: today })
  const [viewingRecord, setViewingRecord] = useState<WorkRecordWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: records = [], isLoading } = useWorkRecords({
    staffId: filters.staffId || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  })
  const { data: staffList = [] } = useStaffList()
  const deleteRecord = useDeleteWorkRecord()

  const totalRevenue = records.reduce((s, r) => s + r.amount, 0)
  const totalDiscount = records.reduce((s, r) => s + ((r as WorkRecordWithRelations & { discount_amount?: number }).discount_amount ?? 0), 0)

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await deleteRecord.mutateAsync(deletingId)
      toast.success('Record deleted')
    } catch { toast.error('Failed') }
    setDeletingId(null)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Work Records Report', 14, 20)
    doc.setFontSize(10)
    doc.text(`Period: ${filters.startDate} to ${filters.endDate}`, 14, 28)
    doc.text(`Total Revenue: ${formatCurrencyPDF(totalRevenue)} | Discount: ${formatCurrencyPDF(totalDiscount)} | Records: ${records.length}`, 14, 34)

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Customer Name', 'Contact No', 'Staff Name', 'Service', 'Amount', 'Discount', 'After Discount', 'Total', 'Pay Mode']],
      body: records.map(r => {
        const discount = (r as WorkRecordWithRelations & { discount_amount?: number }).discount_amount ?? 0
        const gross = r.amount + discount
        const pm = (r as WorkRecordWithRelations & { payment_method?: string }).payment_method ?? 'cash'
        return [
          formatDate(r.date),
          (r.customers as { name: string })?.name ?? '',
          (r.customers as { phone: string })?.phone ?? '',
          (r.staff as { name: string })?.name ?? '',
          (r.services as { name: string })?.name ?? '',
          gross.toFixed(2),
          discount > 0 ? discount.toFixed(2) : '0',
          r.amount.toFixed(2),
          r.amount.toFixed(2),
          pm.toUpperCase(),
        ]
      }),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [103, 80, 164] },
    })
    doc.save(`work-records-${filters.startDate}.pdf`)
    toast.success('PDF exported!')
  }

  const exportExcel = () => {
    const rows = records.map(r => {
      const discount = (r as WorkRecordWithRelations & { discount_amount?: number }).discount_amount ?? 0
      const gross = r.amount + discount
      const pm = (r as WorkRecordWithRelations & { payment_method?: string }).payment_method ?? 'cash'
      return {
        Date: formatDate(r.date),
        'Customer Name': (r.customers as { name: string })?.name ?? '',
        'Contact No': (r.customers as { phone: string })?.phone ?? '',
        'Staff Name': (r.staff as { name: string })?.name ?? '',
        Service: (r.services as { name: string })?.name ?? '',
        Amount: gross,
        Discount: discount,
        'After Discount': r.amount,
        Total: r.amount,
        'Pay Mode': pm.toUpperCase(),
        Notes: r.notes ?? '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Work Records')
    XLSX.writeFile(wb, `work-records-${filters.startDate}.xlsx`)
    toast.success('Excel exported!')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Work Records</h1>
          <p className="text-[#49454F] dark:text-[#CAC4D0] text-sm">
            {records.length} records · {formatCurrency(totalRevenue)} total
            {totalDiscount > 0 && <span className="text-red-500"> · {formatCurrency(totalDiscount)} discounted</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={exportPDF}>PDF</Button>
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={exportExcel}>Excel</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="py-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#79747E] dark:text-[#938F99]">Staff</label>
            <select
              value={filters.staffId}
              onChange={e => setFilters(f => ({ ...f, staffId: e.target.value }))}
              className="rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]"
            >
              <option value="">All Staff</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#79747E] dark:text-[#938F99]">From Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
              className="rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#79747E] dark:text-[#938F99]">To Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
              className="rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] dark:focus:ring-[#D0BCFF]"
            />
          </div>
          <button
            onClick={() => setFilters({ staffId: '', startDate: today, endDate: today })}
            className="px-3 py-2 text-sm text-[#79747E] dark:text-[#938F99] hover:text-[#49454F] dark:hover:text-[#CAC4D0]"
          >
            Reset
          </button>
        </div>
      </Card>

      <Card className="p-0">
        <Table
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: r => <span className="text-xs text-[#49454F] dark:text-[#CAC4D0]">{formatDate(r.date)}</span>,
            },
            {
              key: 'customer',
              header: 'Customer',
              render: r => (
                <div>
                  <p className="font-medium text-[#1D1A22] dark:text-[#E6E0E9]">{(r.customers as { name: string })?.name}</p>
                  <p className="text-xs text-[#79747E] dark:text-[#938F99]">{(r.customers as { phone: string })?.phone}</p>
                </div>
              ),
            },
            {
              key: 'service',
              header: 'Service',
              render: r => <span className="text-sm">{(r.services as { name: string })?.name}</span>,
            },
            {
              key: 'staff',
              header: 'Staff',
              render: r => (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] text-xs flex items-center justify-center font-bold">
                    {(r.staff as { name: string })?.name?.charAt(0)}
                  </div>
                  <span className="text-sm">{(r.staff as { name: string })?.name}</span>
                </div>
              ),
            },
            {
              key: 'time',
              header: 'Time',
              render: r => (
                <div className="flex items-center gap-1 text-xs text-[#49454F] dark:text-[#CAC4D0]">
                  <Clock size={12} />
                  {formatTime(r.start_time)}
                  {r.end_time && ` – ${formatTime(r.end_time)}`}
                </div>
              ),
            },
            {
              key: 'duration',
              header: 'Duration',
              render: r => (
                <Badge variant={r.end_time ? 'blue' : 'yellow'}>
                  {calculateDuration(r.start_time, r.end_time)}
                </Badge>
              ),
            },
            {
              key: 'discount',
              header: 'Discount',
              render: r => {
                const discount = (r as WorkRecordWithRelations & { discount_amount?: number }).discount_amount ?? 0
                return discount > 0
                  ? <span className="text-xs font-semibold text-red-500">−{formatCurrency(discount)}</span>
                  : <span className="text-xs text-[#CAC4D0] dark:text-[#49454F]">—</span>
              },
            },
            {
              key: 'amount',
              header: 'After Discount',
              render: r => <span className="font-bold text-[#6750A4] dark:text-[#D0BCFF]">{formatCurrency(r.amount)}</span>,
            },
            {
              key: 'paymode',
              header: 'Pay Mode',
              render: r => {
                const pm = (r as WorkRecordWithRelations & { payment_method?: string }).payment_method ?? 'cash'
                const Icon = pm === 'cash' ? Banknote : pm === 'card' ? CreditCard : Smartphone
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0]">
                    <Icon size={10} /> {pm}
                  </span>
                )
              },
            },
            {
              key: 'actions',
              header: '',
              render: r => (
                <div className="flex gap-1">
                  <button onClick={() => setViewingRecord(r)} className="p-1.5 rounded-lg text-[#79747E] dark:text-[#938F99] hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30">
                    <Eye size={14} />
                  </button>
                  <button onClick={() => setDeletingId(r.id)} className="p-1.5 rounded-lg text-[#79747E] dark:text-[#938F99] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                    <Trash2 size={14} />
                  </button>
                </div>
              ),
            },
          ]}
          data={records}
          keyExtractor={r => r.id}
          loading={isLoading}
          emptyMessage="No records found for selected filters"
        />
      </Card>

      {/* View Record */}
      <Modal
        open={!!viewingRecord}
        onClose={() => setViewingRecord(null)}
        title="Work Record Details"
      >
        {viewingRecord && (
          <div className="space-y-3 text-sm">
            {([
              ['Customer', (viewingRecord.customers as { name: string })?.name],
              ['Contact No', (viewingRecord.customers as { phone: string })?.phone],
              ['Service', (viewingRecord.services as { name: string })?.name],
              ['Staff Name', (viewingRecord.staff as { name: string })?.name],
              ['Date', formatDate(viewingRecord.date)],
              ['Start Time', formatTime(viewingRecord.start_time)],
              ['End Time', viewingRecord.end_time ? formatTime(viewingRecord.end_time) : 'In Progress'],
              ['Duration', calculateDuration(viewingRecord.start_time, viewingRecord.end_time)],
              ['Amount', formatCurrency(viewingRecord.amount + ((viewingRecord as WorkRecordWithRelations & { discount_amount?: number }).discount_amount ?? 0))],
              ['Discount', formatCurrency((viewingRecord as WorkRecordWithRelations & { discount_amount?: number }).discount_amount ?? 0)],
              ['After Discount / Total', formatCurrency(viewingRecord.amount)],
              ['Pay Mode', ((viewingRecord as WorkRecordWithRelations & { payment_method?: string }).payment_method ?? 'cash').toUpperCase()],
              ['Notes', viewingRecord.notes || '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between py-2 border-b border-[#E8DEF8] dark:border-[#382E48]">
                <span className="text-[#49454F] dark:text-[#CAC4D0]">{label}</span>
                <span className="font-medium text-[#1D1A22] dark:text-[#E6E0E9]">{value}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Delete Work Record"
        message="Are you sure you want to delete this work record?"
        loading={deleteRecord.isPending}
      />
    </div>
  )
}
