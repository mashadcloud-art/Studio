import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Eye, Pencil, Trash2, Phone, MapPin } from 'lucide-react'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../../hooks/useCustomers'
import { useWorkRecords } from '../../hooks/useWorkRecords'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { formatDate, formatCurrency, formatDateTime, toTitleCase } from '../../lib/utils'
import type { Customer } from '../../types/database'
import toast from 'react-hot-toast'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  phone: z.string().min(6, 'Phone required'),
  address: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function CustomersPage() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: customers = [], isLoading } = useCustomers(search)
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()

  const { data: customerHistory } = useWorkRecords(
    viewingCustomer ? { } : undefined
  )
  const historyForCustomer = customerHistory?.filter(
    r => (r.customers as { id: string })?.id === viewingCustomer?.id
  ) ?? []

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const openCreate = () => {
    setEditingCustomer(null)
    reset()
    setShowModal(true)
  }

  const openEdit = (c: Customer) => {
    setEditingCustomer(c)
    reset({ name: c.name, phone: c.phone, address: c.address ?? '' })
    setShowModal(true)
  }

  const onSubmit = async (data: FormData) => {
    try {
      const formattedData = {
        ...data,
        name: toTitleCase(data.name),
        address: data.address ? toTitleCase(data.address) : undefined,
      }
      if (editingCustomer) {
        await updateCustomer.mutateAsync({ id: editingCustomer.id, updates: formattedData })
        toast.success('Customer updated')
      } else {
        await createCustomer.mutateAsync(formattedData)
        toast.success('Customer added')
      }
      setShowModal(false)
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Error')
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await deleteCustomer.mutateAsync(deletingId)
      toast.success('Customer deleted')
    } catch { toast.error('Failed') }
    setDeletingId(null)
  }

  const totalSpent = (customerId: string) => {
    return customerHistory
      ?.filter(r => (r.customers as { id: string })?.id === customerId)
      .reduce((sum, r) => sum + r.amount, 0) ?? 0
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Customers</h1>
          <p className="text-[#49454F] dark:text-[#938F99] text-sm">{customers.length} customers</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>Add Customer</Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#79747E] dark:text-[#938F99]" />
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] placeholder-[#79747E] dark:placeholder-[#938F99] text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4]"
        />
      </div>

      <Card className="p-0">
        <Table
          columns={[
            {
              key: 'name',
              header: 'Customer',
              render: c => (
                <div>
                  <p className="font-semibold text-[#1D1A22] dark:text-[#E6E0E9] capitalize">{toTitleCase(c.name)}</p>
                  <p className="text-xs text-[#79747E] dark:text-[#938F99]">{formatDate(c.created_at)}</p>
                </div>
              ),
            },
            {
              key: 'phone',
              header: 'Phone',
              render: c => (
                <div className="flex items-center gap-1 text-[#49454F] dark:text-[#CAC4D0]">
                  <Phone size={13} />
                  {c.phone}
                </div>
              ),
            },
            {
              key: 'address',
              header: 'Address',
              render: c => c.address ? (
                <div className="flex items-center gap-1 text-[#49454F] dark:text-[#938F99] text-xs capitalize">
                  <MapPin size={12} />
                  {toTitleCase(c.address)}
                </div>
              ) : <span className="text-[#CAC4D0] dark:text-[#49454F]">—</span>,
            },
            {
              key: 'actions',
              header: '',
              render: c => (
                <div className="flex items-center gap-1 justify-end">
                  <button onClick={() => setViewingCustomer(c)} className="p-1.5 rounded-lg text-[#79747E] dark:text-[#938F99] hover:text-blue-600 hover:bg-blue-50">
                    <Eye size={15} />
                  </button>
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-[#79747E] dark:text-[#938F99] hover:text-green-600 hover:bg-green-50">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeletingId(c.id)} className="p-1.5 rounded-lg text-[#79747E] dark:text-[#938F99] hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              ),
            },
          ]}
          data={customers}
          keyExtractor={c => c.id}
          loading={isLoading}
          emptyMessage="No customers found"
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button form="customer-form" type="submit" loading={isSubmitting}>
              {editingCustomer ? 'Save' : 'Add'}
            </Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Full Name" className="capitalize" autoCapitalize="words" error={errors.name?.message} {...register('name')} />
          <Input label="Phone Number" error={errors.phone?.message} {...register('phone')} />
          <Input label="Address (optional)" className="capitalize" autoCapitalize="words" error={errors.address?.message} {...register('address')} />
        </form>
      </Modal>

      {/* View History Modal */}
      <Modal
        open={!!viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        title={`${viewingCustomer?.name} - Visit History`}
        size="lg"
      >
        {viewingCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-[#F3EDF7] dark:bg-[#2B2930]">
                <p className="text-[#49454F] dark:text-[#938F99]">Phone</p>
                <p className="font-medium">{viewingCustomer.phone}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#EADDFF] dark:bg-[#4F378B]">
                <p className="text-[#6750A4] dark:text-[#D0BCFF]">Total Spent</p>
                <p className="font-bold text-[#21005D] dark:text-[#EADDFF]">{formatCurrency(totalSpent(viewingCustomer.id))}</p>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-[#1D1A22] dark:text-[#E6E0E9] mb-2">Visit History ({historyForCustomer.length})</h4>
              {historyForCustomer.length === 0 ? (
                <p className="text-[#79747E] dark:text-[#938F99] text-sm">No visits yet</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {historyForCustomer.map(r => (
                    <div key={r.id} className="p-3 rounded-xl border border-[#E8DEF8] dark:border-[#382E48] text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{(r.services as { name: string })?.name}</span>
                        <span className="font-bold text-[#6750A4] dark:text-[#D0BCFF]">{formatCurrency(r.amount)}</span>
                      </div>
                      <div className="text-xs text-[#79747E] dark:text-[#938F99] mt-1">
                        {formatDateTime(r.start_time)} · by {(r.staff as { name: string })?.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Delete Customer"
        message="Are you sure? This will remove the customer record."
        loading={deleteCustomer.isPending}
      />
    </div>
  )
}
