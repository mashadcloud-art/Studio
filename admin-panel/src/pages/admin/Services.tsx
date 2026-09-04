import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Scissors, Pencil, Trash2, Clock, Tag } from 'lucide-react'
import { useServices, useCreateService, useUpdateService, useDeleteService } from '../../hooks/useServices'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal, ConfirmModal } from '../../components/ui/Modal'
import { formatCurrency, toTitleCase } from '../../lib/utils'
import type { Service } from '../../types/database'
import toast from 'react-hot-toast'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  price: z.coerce.number().min(0, 'Price required'),
  duration: z.coerce.number().min(1, 'Duration required'),
  category: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const CATEGORIES = [
  'Manicure', 'Pedicure', 'Nail Art', 'Gel Nails', 'Acrylic Nails',
  'Nail Extensions', 'Nail Repair', 'Hand & Foot Care', 'Other'
]

export function ServicesPage() {
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('all')
  const [search, setSearch] = useState('')

  const { data: services = [], isLoading } = useServices()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const categories = Array.from(new Set(services.map(s => s.category).filter(Boolean)))
  const filtered = filterCategory === 'all'
    ? services.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
    : services.filter(s => s.category === filterCategory && (!search || s.name.toLowerCase().includes(search.toLowerCase())))

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const openCreate = () => {
    setEditingService(null)
    reset({ duration: 30 })
    setShowModal(true)
  }

  const openEdit = (s: Service) => {
    setEditingService(s)
    reset({ name: s.name, price: s.price, duration: s.duration, category: s.category ?? '' })
    setShowModal(true)
  }

  const onSubmit = async (data: FormData) => {
    try {
      const formattedData = {
        ...data,
        name: toTitleCase(data.name),
        category: data.category ? toTitleCase(data.category) : undefined,
      }
      if (editingService) {
        await updateService.mutateAsync({ id: editingService.id, updates: formattedData })
        toast.success('Service updated')
      } else {
        await createService.mutateAsync(formattedData)
        toast.success('Service added')
      }
      setShowModal(false)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await deleteService.mutateAsync(deletingId)
      toast.success('Service deleted')
    } catch { toast.error('Failed') }
    setDeletingId(null)
  }

  const handleToggleActive = async (s: Service) => {
    await updateService.mutateAsync({ id: s.id, updates: { active: !s.active } })
  }

  const groupedByCategory = filtered.reduce((acc, s) => {
    const cat = s.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {} as Record<string, Service[]>)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1A22] dark:text-[#E6E0E9]">Services</h1>
          <p className="text-[#79747E] dark:text-[#938F99] text-sm mt-0.5">{services.filter(s => s.active).length} active · {services.length} total</p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={15} />}>Add Service</Button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...categories].map(cat => (
          <button
            key={cat as string}
            onClick={() => setFilterCategory(cat as string)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filterCategory === cat
                ? 'bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]'
                : 'bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] text-[#49454F] dark:text-[#CAC4D0] hover:border-[#6750A4] dark:hover:border-[#D0BCFF] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9]'
            }`}
          >
            {cat === 'all' ? 'All' : cat as string}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-7 h-7 border-2 border-[#6750A4] dark:border-[#D0BCFF] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByCategory).map(([category, svcList]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                <Tag size={13} className="text-[#79747E] dark:text-[#938F99]" />
                <h3 className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-widest">{category}</h3>
                <div className="flex-1 h-px bg-[#E8DEF8] dark:bg-[#382E48]" />
                <span className="text-xs text-[#79747E] dark:text-[#938F99]">{svcList.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {svcList.map(s => (
                  <div
                    key={s.id}
                    className={`bg-white dark:bg-[#1D192B] rounded-2xl border p-5 transition-all hover:shadow-md ${
                      s.active ? 'border-[#E8DEF8] dark:border-[#382E48]' : 'border-[#E8DEF8] dark:border-[#382E48] opacity-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#F3EDF7] dark:bg-[#2B2930] flex items-center justify-center">
                          <Scissors size={17} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                        </div>
                        <div>
                          <p className="font-bold text-[#1D1A22] dark:text-[#E6E0E9] text-sm">{s.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={11} className="text-[#79747E] dark:text-[#938F99]" />
                            <span className="text-xs text-[#79747E] dark:text-[#938F99]">{s.duration} min</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-lg font-bold text-[#1D1A22] dark:text-[#E6E0E9]">{formatCurrency(s.price)}</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#E8DEF8] dark:border-[#382E48]">
                      <button
                        onClick={() => handleToggleActive(s)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          s.active
                            ? 'bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#938F99] hover:bg-[#E8DEF8] dark:hover:bg-[#382E48]'
                            : 'bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72] hover:bg-[#7F67BE] dark:hover:bg-[#E8DEF8]'
                        }`}
                      >
                        {s.active ? 'Active' : 'Inactive'}
                      </button>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(s)}
                          className="p-1.5 rounded-lg text-[#CAC4D0] dark:text-[#49454F] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeletingId(s.id)}
                          className="p-1.5 rounded-lg text-[#CAC4D0] dark:text-[#49454F] hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-[#1D192B] rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
              <Scissors size={32} className="mx-auto text-[#CAC4D0] dark:text-[#49454F] mb-3" />
              <p className="text-[#79747E] dark:text-[#938F99]">No services found</p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingService ? 'Edit Service' : 'Add Service'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button form="service-form" type="submit" loading={isSubmitting}>
              {editingService ? 'Save' : 'Add Service'}
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Service Name" className="capitalize" autoCapitalize="words" error={errors.name?.message} {...register('name')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Price (₹)" type="number" step="0.01" error={errors.price?.message} {...register('price')} />
            <Input label="Duration (minutes)" type="number" error={errors.duration?.message} {...register('duration')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wide">Category (optional)</label>
            <input
              list="categories"
              placeholder="e.g. Manicure, Gel Nails"
              className="w-full rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4] transition-all"
              {...register('category')}
            />
            <datalist id="categories">
              {CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Delete Service"
        message="Are you sure? Services linked to work records cannot be deleted."
        loading={deleteService.isPending}
      />
    </div>
  )
}
