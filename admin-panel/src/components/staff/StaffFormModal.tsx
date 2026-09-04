import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useUpdateStaff, useStaffList } from '../../hooks/useStaff'
import { toTitleCase } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Input'
import { Modal } from '../ui/Modal'
import type { Staff } from '../../types/database'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const SPECIALITIES = [
  'General', 'Nail Technician', 'Manicure Specialist', 'Pedicure Specialist',
  'Nail Art Artist', 'Acrylic Specialist', 'Gel Specialist', 'Senior Technician', 'Manager'
]

const staffSchema = z.object({
  name: z.string().min(2, 'Name required'),
  staff_code: z.string().optional(),
  phone: z.string().min(6, 'Phone required'),
  address: z.string().optional(),
  joining_date: z.string().min(1, 'Joining date required'),
  salary: z.coerce.number().min(0),
  overtime_rate: z.coerce.number().min(0).optional(),
  role: z.enum(['admin', 'staff', 'receptionist']),
  speciality: z.string().optional(),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  password: z.string().min(6, 'Min 6 characters').optional().or(z.literal('')),
  can_view_staff: z.boolean().optional(),
  can_view_reports: z.boolean().optional(),
})
type StaffForm = z.infer<typeof staffSchema>

interface StaffFormModalProps {
  open: boolean
  onClose: () => void
  editingStaff: Staff | null
}

export function StaffFormModal({ open, onClose, editingStaff }: StaffFormModalProps) {
  const updateStaff = useUpdateStaff()
  const { data: staffList = [] } = useStaffList()
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
  })
  const watchRole = watch('role')

  // Load the right defaults into the form whenever the modal opens
  useEffect(() => {
    if (!open) return
    if (editingStaff) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaultEmail = (editingStaff as any).email || `${editingStaff.name.toLowerCase().replace(/\s+/g, '')}@nailuxe.com`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const staffIdx = staffList.findIndex(s => s.id === editingStaff.id)
      const defaultCode = (editingStaff as any).staff_code || `NLX-${String((staffIdx >= 0 ? staffIdx : 0) + 1).padStart(2, '0')}`
      reset({
        name: editingStaff.name,
        staff_code: defaultCode,
        phone: editingStaff.phone, address: editingStaff.address ?? '',
        joining_date: editingStaff.joining_date, salary: editingStaff.salary,
        overtime_rate: editingStaff.overtime_rate ?? 0,
        role: editingStaff.role as 'admin' | 'staff' | 'receptionist',
        speciality: (editingStaff as Staff & { speciality?: string }).speciality ?? 'General',
        email: defaultEmail,
        password: '',
      })
    } else {
      const nextCode = `NLX-${String(staffList.length + 1).padStart(2, '0')}`
      reset({
        role: 'staff',
        staff_code: nextCode,
        joining_date: new Date().toISOString().split('T')[0],
        speciality: 'General',
        overtime_rate: 0,
      })
    }
  }, [open, editingStaff, reset, staffList])

  const onSubmit = async (data: StaffForm) => {
    try {
      const formattedName = toTitleCase(data.name)
      const formattedAddress = data.address ? toTitleCase(data.address) : null
      const formattedCode = data.staff_code?.toUpperCase().trim() || null

      if (editingStaff) {
        await updateStaff.mutateAsync({
          id: editingStaff.id,
          updates: {
            name: formattedName, phone: data.phone, address: formattedAddress,
            joining_date: data.joining_date, salary: data.salary,
            overtime_rate: data.overtime_rate ?? 0,
            role: data.role,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(data.speciality && { speciality: data.speciality } as any),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(formattedCode && { staff_code: formattedCode } as any),
          },
        })

        // If a new password was entered when editing, update it in Supabase Auth
        if (data.password && data.password.trim().length >= 6) {
          const { error: resetErr } = await db.functions.invoke('reset-staff-password', {
            body: { userId: editingStaff.id, newPassword: data.password.trim() },
          })
          if (resetErr) {
            toast.error(`Password update error: ${resetErr.message}`)
          } else {
            toast.success('Staff details & password updated!')
          }
        } else {
          toast.success('Staff updated')
        }

        onClose()
        return
      }

      const { data: result, error: fnError } = await db.functions.invoke('create-staff-user', {
        body: {
          name: formattedName, phone: data.phone, address: formattedAddress,
          staff_code: formattedCode,
          joining_date: data.joining_date, salary: data.salary,
          overtime_rate: data.overtime_rate ?? 0,
          role: data.role, speciality: data.speciality,
          email: data.email, password: data.password,
        },
      })

      if (fnError || result?.error) {
        toast.error(fnError?.message ?? result?.error ?? 'Failed')
        return
      }

      // Save receptionist permissions
      if (data.role === 'receptionist' && result?.userId) {
        await db.from('receptionist_permissions').upsert({
          staff_id: result.userId,
          can_view_staff: data.can_view_staff ?? false,
          can_view_reports: data.can_view_reports ?? false,
        })
      }

      toast.success('Staff member added!')
      onClose()
      reset()
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingStaff ? 'Edit Team Member' : 'Add New Team Member'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button form="staff-form" type="submit" loading={isSubmitting}>
            {editingStaff ? 'Save Changes' : 'Add Member'}
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full Name" className="capitalize" autoCapitalize="words" error={errors.name?.message} {...register('name')} />
          <Input label="Staff Code" placeholder="e.g. NLX-01" className="uppercase font-mono font-bold tracking-wider" error={errors.staff_code?.message} {...register('staff_code')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Phone Number" error={errors.phone?.message} {...register('phone')} />
          <Input label="Address" className="capitalize" autoCapitalize="words" error={errors.address?.message} {...register('address')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Joining Date" type="date" error={errors.joining_date?.message} {...register('joining_date')} />
          <Input label="Monthly Salary ($)" type="number" step="0.01" error={errors.salary?.message} {...register('salary')} />
        </div>
        <Input
          label="Overtime Rate ($ / hour)"
          type="number" step="0.01"
          error={errors.overtime_rate?.message}
          {...register('overtime_rate')}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Role"
            options={[
              { value: 'staff', label: '💅 Staff / Technician' },
              { value: 'receptionist', label: '📋 Receptionist' },
              { value: 'admin', label: '⚡ Admin' },
            ]}
            error={errors.role?.message}
            {...register('role')}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#49454F] dark:text-[#CAC4D0]">Speciality</label>
            <input
              list="specialities"
              placeholder="e.g. Nail Technician"
              className="w-full rounded-xl border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#1D1A22] dark:text-[#E6E0E9] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6750A4]"
              {...register('speciality')}
            />
            <datalist id="specialities">
              {SPECIALITIES.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>

        {/* Receptionist permissions */}
        {watchRole === 'receptionist' && (
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">📋 Receptionist Permissions</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { field: 'can_view_staff', label: 'View Staff List' },
                { field: 'can_view_reports', label: 'View Reports' },
              ].map(p => (
                <label key={p.field} className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 cursor-pointer">
                  <input type="checkbox" {...register(p.field as 'can_view_staff' | 'can_view_reports')}
                    className="rounded border-blue-300 text-blue-600" />
                  {p.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-2">Bookings, customers, services always enabled for receptionist</p>
          </div>
        )}

        {/* Login Credentials Section (Always visible) */}
        <div className="bg-[#FEF7FF] dark:bg-[#1D192B] border border-[#D0BCFF] dark:border-[#4F378B] rounded-2xl p-4 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-base">🔐</span>
            <div>
              <p className="text-xs font-bold text-[#21005D] dark:text-[#EADDFF] uppercase tracking-wide">
                Login Credentials
              </p>
              <p className="text-[11px] text-[#49454F] dark:text-[#CAC4D0]">
                {editingStaff
                  ? 'View or change username and password for this team member'
                  : 'Used by the staff member to log in at localhost:5173/login'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Login Username / Email"
              type="email"
              placeholder="e.g. nimisha@nailuxe.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label={editingStaff ? 'Change Password (optional)' : 'Login Password'}
              type="password"
              placeholder={editingStaff ? 'Leave blank to keep password123' : 'Min 6 characters'}
              error={errors.password?.message}
              {...register('password')}
            />
          </div>
          {editingStaff && (
            <p className="text-[11px] text-[#6750A4] dark:text-[#D0BCFF] font-medium">
              💡 Current default password is <code className="bg-[#EADDFF] dark:bg-[#4F378B] px-1.5 py-0.5 rounded font-mono font-bold text-[#21005D] dark:text-white">password123</code> unless changed above.
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}
