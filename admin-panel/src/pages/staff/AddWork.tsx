import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Play, Square, Search, Trash2, Camera, ChevronDown, ChevronUp, Banknote, CreditCard, Smartphone, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useServices } from '../../hooks/useServices'
import { useCreateCustomer } from '../../hooks/useCustomers'
import { useCreateWorkRecord, useUpdateWorkRecord, useTodayWorkRecords } from '../../hooks/useWorkRecords'
import { formatCurrency, formatTime, calculateDuration } from '../../lib/utils'
import type { WorkRecordWithRelations, Customer, Service } from '../../types/database'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type PaymentMethod = 'cash' | 'card' | 'gpay' | 'upi' | 'other'

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode; sub: string }[] = [
  { id: 'cash',  label: 'Cash',  icon: <Banknote size={16} />,    sub: 'Cash in hand' },
  { id: 'gpay',  label: 'GPay',  icon: <Smartphone size={16} />,  sub: 'Goes to bank' },
  { id: 'upi',   label: 'UPI',   icon: <Smartphone size={16} />,  sub: 'Goes to bank' },
  { id: 'card',  label: 'Card',  icon: <CreditCard size={16} />,  sub: 'Goes to bank' },
  { id: 'other', label: 'Other', icon: <Banknote size={16} />,    sub: 'Specify' },
]

const schema = z.object({
  customerName: z.string().min(2, 'Required'),
  customerPhone: z.string().min(6, 'Required'),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface ExtraService { id: string; service_id: string; name: string; price: number; discount: number }

const SectionLabel = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
    {children}
  </div>
)

export function AddWork() {
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
  }
  const [activeRecord, setActiveRecord] = useState<WorkRecordWithRelations | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; phone: string }[]>([])
  // True once an EXISTING customer is picked from search — their saved phone
  // number is auto-filled for the booking but never shown to staff (privacy:
  // staff should not be able to read out / message customers' numbers).
  const [isExistingCustomer, setIsExistingCustomer] = useState(false)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [primaryDiscount, setPrimaryDiscount] = useState('')
  const [extraServices, setExtraServices] = useState<ExtraService[]>([])
  const [customAmount, setCustomAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [workPhotoUrl, setWorkPhotoUrl] = useState<string | null>(null)
  const [serviceSearch, setServiceSearch] = useState('')
  const [showAllExtra, setShowAllExtra] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const { data: services = [] } = useServices()
  const createCustomer = useCreateCustomer()
  const createWork = useCreateWorkRecord()
  const updateWork = useUpdateWorkRecord()
  const { data: todayRecords = [] } = useTodayWorkRecords(staff?.id)

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const activeServices = services.filter(s => s.active)
  const filteredServices = serviceSearch
    ? activeServices.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()) || (s.category ?? '').toLowerCase().includes(serviceSearch.toLowerCase()))
    : activeServices

  const grouped = filteredServices.reduce<Record<string, Service[]>>((acc, s) => {
    const cat = s.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  const extraOptions = activeServices.filter(s =>
    s.id !== selectedService?.id && !extraServices.find(e => e.service_id === s.id)
  )
  const visibleExtra = showAllExtra ? extraOptions : extraOptions.slice(0, 6)

  const grossAmount = (selectedService?.price ?? 0) +
    extraServices.reduce((sum, s) => sum + s.price, 0) +
    (parseFloat(customAmount) || 0)

  const primaryDiscountAmount = selectedService ? Math.min(Math.max(parseFloat(primaryDiscount) || 0, 0), selectedService.price) : 0
  const extrasDiscountAmount = extraServices.reduce((sum, s) => sum + Math.min(Math.max(s.discount, 0), s.price), 0)
  const totalDiscount = primaryDiscountAmount + extrasDiscountAmount
  const totalAmount = grossAmount - totalDiscount

  const isCash = paymentMethod === 'cash'

  const searchCustomers = async (query: string) => {
    setCustomerSearch(query)
    setValue('customerName', query)
    // Editing the name again after picking someone means the previous
    // selection no longer applies — drop the hidden phone we'd stashed.
    if (isExistingCustomer) {
      setIsExistingCustomer(false)
      setValue('customerPhone', '')
    }
    if (query.length < 2) { setSearchResults([]); return }
    const { data } = await db.from('customers').select('id, name, phone')
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%`).limit(5)
    setSearchResults((data as { id: string; name: string; phone: string }[]) ?? [])
  }

  const selectCustomer = (c: { id: string; name: string; phone: string }) => {
    setValue('customerName', c.name)
    setValue('customerPhone', c.phone)
    setCustomerSearch(c.name)
    setSearchResults([])
    setIsExistingCustomer(true)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !staff) return
    setUploadingPhoto(true)
    try {
      const file = e.target.files[0]
      const ext = file.name.split('.').pop()
      const path = `${staff.id}/${Date.now()}.${ext}`
      await db.storage.from('work_photos').upload(path, file)
      const { data: { publicUrl } } = db.storage.from('work_photos').getPublicUrl(path)
      setWorkPhotoUrl(publicUrl)
      toast.success('Photo uploaded!')
    } catch (e: unknown) { toast.error((e as Error).message) }
    setUploadingPhoto(false)
  }

  const onSubmit = async (data: FormData) => {
    if (!staff) return
    if (!selectedService) { toast.error('Please select a primary service'); return }
    try {
      const customer = await createCustomer.mutateAsync({ name: data.customerName, phone: data.customerPhone }) as Customer
      const record = await createWork.mutateAsync({
        staff_id: staff.id, customer_id: customer.id,
        service_id: selectedService.id, start_time: new Date().toISOString(),
        amount: totalAmount, notes: data.notes,
      })
      // Save payment method + discount + extras
      await db.from('work_records').update({
        payment_method: paymentMethod,
        discount_amount: totalDiscount,
        ...(extraServices.length > 0 && { extra_services: extraServices }),
        ...(workPhotoUrl && { photo_url: workPhotoUrl }),
      }).eq('id', record.id)

      setActiveRecord(record as WorkRecordWithRelations)
      toast.success(`Session started! Payment: ${paymentMethod.toUpperCase()}`)
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  const stopSession = async () => {
    if (!activeRecord) return
    await updateWork.mutateAsync({ id: activeRecord.id, updates: { end_time: new Date().toISOString() } })
    toast.success('Session completed! 🎉')
    setActiveRecord(null); reset(); setCustomerSearch(''); setSelectedService(null)
    setPrimaryDiscount(''); setExtraServices([]); setCustomAmount(''); setWorkPhotoUrl(null)
    setServiceSearch(''); setPaymentMethod('cash')
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: '-0.5px' }}>Add Customer Work</h1>
        <p style={{ fontSize: 13, color: c.muted, marginTop: 3 }}>Record a new service session</p>
      </div>

      {/* Active Session Banner */}
      {activeRecord && (
        <div style={{ background: 'linear-gradient(135deg, #381E72 0%, #4F378B 55%, #6750A4 100%)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: 12, color: '#E8DEF8', fontWeight: 600 }}>SESSION IN PROGRESS</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>
                {(activeRecord.customers as { name: string })?.name}
              </div>
              <div style={{ fontSize: 13, color: '#CAC4D0', marginTop: 4 }}>
                {(activeRecord.services as { name: string })?.name} · Started {formatTime(activeRecord.start_time)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{formatCurrency(totalAmount)}</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 99,
                  background: isCash ? 'rgba(74, 222, 128, 0.15)' : 'rgba(96, 165, 250, 0.15)',
                  border: `1px solid ${isCash ? 'rgba(74,222,128,0.3)' : 'rgba(96,165,250,0.3)'}`
                }}>
                  {isCash ? <Banknote size={12} color="#4ade80" /> : <Smartphone size={12} color="#60a5fa" />}
                  <span style={{ fontSize: 11, fontWeight: 700, color: isCash ? '#4ade80' : '#60a5fa' }}>
                    {paymentMethod.toUpperCase()} · {isCash ? 'Cash in Hand' : 'Goes to Bank'}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={stopSession} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: '#ef4444', color: 'white', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif'
            }}>
              <Square size={14} /> Stop
            </button>
          </div>

          {/* Photo upload */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, color: '#CAC4D0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Work Photo</div>
            {workPhotoUrl ? (
              <div style={{ position: 'relative', width: 64, height: 64 }}>
                <img src={workPhotoUrl} alt="work" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} />
                <button onClick={() => setWorkPhotoUrl(null)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ) : (
              <button onClick={() => photoRef.current?.click()} disabled={uploadingPhoto} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#CAC4D0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                <Camera size={14} />
                {uploadingPhoto ? 'Uploading...' : 'Add Photo'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Form */}
      {!activeRecord && (
        <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`, padding: 24 }}>
          <form onSubmit={handleSubmit(onSubmit)}>

            {/* Customer Name */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Customer Name</SectionLabel>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: c.muted2, pointerEvents: 'none' }} />
                <input type="text" value={customerSearch} onChange={e => searchCustomers(e.target.value)}
                  placeholder="Search or enter new customer..."
                  style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: `1px solid ${errors.customerName ? '#ef4444' : c.border}`, fontSize: 14, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
                {errors.customerName && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: 500 }}>{errors.customerName.message}</div>}
                {searchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 4 }}>
                    {searchResults.map(res => (
                      <button key={res.id} type="button" onClick={() => selectCustomer(res)}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: c.surface, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Inter, sans-serif', borderBottom: `1px solid ${c.border}` }}
                        onMouseEnter={e => (e.currentTarget.style.background = c.surfaceVariant)}
                        onMouseLeave={e => (e.currentTarget.style.background = c.surface)}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{res.name}</span>
                        <span style={{ fontSize: 10, color: c.muted2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Saved</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Phone */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Phone Number</SectionLabel>
              {isExistingCustomer ? (
                <>
                  {/* Real number still travels with the form (react-hook-form
                      state was set in selectCustomer) — it's just never
                      rendered where staff can read it. */}
                  <input type="hidden" {...register('customerPhone')} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 13, color: c.muted2, background: c.surfaceVariant, boxSizing: 'border-box', fontStyle: 'italic' }}>
                    <Lock size={13} /> On file — hidden for customer privacy
                  </div>
                </>
              ) : (
                <input placeholder="Phone number" {...register('customerPhone')}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${errors.customerPhone ? '#ef4444' : c.border}`, fontSize: 14, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
              )}
              {errors.customerPhone && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: 500 }}>{errors.customerPhone.message}</div>}
            </div>

            {/* Primary Service */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Primary Service *</SectionLabel>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: c.muted2 }} />
                <input type="text" placeholder="Search services..." value={serviceSearch} onChange={e => setServiceSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, background: c.surfaceVariant, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                {Object.entries(grouped).map(([category, svcs]) => (
                  <div key={category}>
                    <div style={{ padding: '6px 14px', background: c.surfaceVariant, fontSize: 10, fontWeight: 700, color: c.muted2, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: `1px solid ${c.border}` }}>
                      {category}
                    </div>
                    {svcs.map(svc => (
                      <button key={svc.id} type="button" onClick={() => { setSelectedService(svc); setServiceSearch(''); setPrimaryDiscount('') }}
                        style={{ width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: `1px solid ${c.border}`, background: selectedService?.id === svc.id ? c.primary : c.surface, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Inter, sans-serif' }}
                        onMouseEnter={e => { if (selectedService?.id !== svc.id) e.currentTarget.style.background = c.surfaceVariant }}
                        onMouseLeave={e => { e.currentTarget.style.background = selectedService?.id === svc.id ? c.primary : c.surface }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: selectedService?.id === svc.id ? c.onPrimary : c.text }}>{svc.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: selectedService?.id === svc.id ? c.onPrimary : c.text }}>{formatCurrency(svc.price)}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {Object.keys(grouped).length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: c.muted2, fontSize: 13 }}>No services found</div>
                )}
              </div>
              {!selectedService && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: 500 }}>Please select a service</div>}

              {selectedService && (
                <div style={{ marginTop: 8, padding: '10px 12px', background: c.surfaceVariant, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{selectedService.name}</div>
                    <div style={{ fontSize: 11, color: c.muted2, marginTop: 1 }}>Amount {formatCurrency(selectedService.price)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: c.muted2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Discount ₹</label>
                    <input type="number" min="0" step="0.01" placeholder="0" value={primaryDiscount} onChange={e => setPrimaryDiscount(e.target.value)}
                      style={{ width: 84, padding: '6px 8px', borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', textAlign: 'right', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Extra services */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Additional Services <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></SectionLabel>
              {extraServices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {extraServices.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: c.primary, borderRadius: 8, gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.onPrimary, flex: 1, minWidth: 0 }}>{e.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: isDark ? 'rgba(56,30,114,0.7)' : 'rgba(255,255,255,0.7)' }}>−₹</span>
                        <input type="number" min="0" step="0.01" placeholder="0" value={e.discount || ''}
                          onChange={ev => setExtraServices(prev => prev.map(x => x.id === e.id ? { ...x, discount: parseFloat(ev.target.value) || 0 } : x))}
                          style={{ width: 52, padding: '4px 6px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', textAlign: 'right', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: c.onPrimary }}>{formatCurrency(e.price)}</span>
                        <button type="button" onClick={() => setExtraServices(prev => prev.filter(x => x.id !== e.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                          <Trash2 size={13} color={isDark ? 'rgba(56,30,114,0.6)' : 'rgba(255,255,255,0.4)'} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {visibleExtra.map(svc => (
                  <button key={svc.id} type="button"
                    onClick={() => setExtraServices(prev => [...prev, { id: crypto.randomUUID(), service_id: svc.id, name: svc.name, price: svc.price, discount: 0 }])}
                    style={{ padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: 99, background: c.surface, fontSize: 12, fontWeight: 500, color: c.surfaceVariantText, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = c.primary; e.currentTarget.style.color = c.primary }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.surfaceVariantText }}>
                    + {svc.name} · {formatCurrency(svc.price)}
                  </button>
                ))}
                {extraOptions.length > 6 && (
                  <button type="button" onClick={() => setShowAllExtra(!showAllExtra)} style={{ padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: 99, background: c.surface, fontSize: 12, fontWeight: 600, color: c.muted, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {showAllExtra ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> {extraOptions.length - 6} more</>}
                  </button>
                )}
              </div>
            </div>

            {/* Custom amount */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Extra Amount (₹) <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(tips, special requests)</span></SectionLabel>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 14, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
            </div>

            {/* ── PAYMENT METHOD ────────────────────────────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Payment Method</SectionLabel>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PAYMENT_METHODS.map(pm => {
                  const isSelected = paymentMethod === pm.id
                  return (
                    <button key={pm.id} type="button" onClick={() => setPaymentMethod(pm.id)}
                      style={{
                        padding: '10px 6px', borderRadius: 10, border: `2px solid ${isSelected ? c.primary : c.border}`,
                        background: isSelected ? c.primary : c.surface, cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, transition: 'all 0.1s'
                      }}>
                      <span style={{ color: isSelected ? c.onPrimary : c.muted }}>{pm.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? c.onPrimary : c.text }}>{pm.label}</span>
                      <span style={{ fontSize: 9, fontWeight: 500, color: isSelected ? (isDark ? 'rgba(56,30,114,0.6)' : 'rgba(255,255,255,0.5)') : c.muted2, textAlign: 'center', lineHeight: 1.2 }}>{pm.sub}</span>
                    </button>
                  )
                })}
              </div>

              {/* Payment destination indicator */}
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 10,
                background: isCash ? c.successBg : c.infoBg,
                border: `1px solid ${isCash ? c.successBorder : c.infoBorder}`,
                display: 'flex', alignItems: 'center', gap: 8
              }}>
                {isCash ? <Banknote size={15} color={c.successText} /> : <Smartphone size={15} color={c.infoText} />}
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isCash ? c.successTextStrong : c.infoTextStrong }}>
                    {isCash ? 'Goes to Cash in Hand' : `Goes to Bank Account (${paymentMethod.toUpperCase()})`}
                  </span>
                  <div style={{ fontSize: 11, color: isCash ? '#4ade80' : '#60a5fa', marginTop: 1 }}>
                    {isCash
                      ? 'This amount will be added to your cash in hand'
                      : 'This amount will be added to your bank account balance'}
                  </div>
                </div>
              </div>
            </div>

            {/* Work photo */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Work Photo <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></SectionLabel>
              {workPhotoUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={workPhotoUrl} alt="work" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: `1px solid ${c.border}` }} />
                  <button type="button" onClick={() => setWorkPhotoUrl(null)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Remove</button>
                </div>
              ) : (
                <button type="button" onClick={() => photoRef.current?.click()} disabled={uploadingPhoto}
                  style={{ width: '100%', padding: 12, border: `1.5px dashed ${c.border}`, borderRadius: 10, background: c.surface, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: c.muted }}>
                  <Camera size={16} color={c.muted2} />
                  {uploadingPhoto ? 'Uploading...' : 'Take or upload a photo'}
                </button>
              )}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 18 }}>
              <SectionLabel color={c.muted}>Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></SectionLabel>
              <textarea placeholder="Any special notes..." rows={2} {...register('notes')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 14, color: c.text, background: c.surface, outline: 'none', fontFamily: 'Inter, sans-serif', resize: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Total + payment summary */}
            {selectedService && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: c.primary, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: isDark ? '#381E72' : '#E8DEF8', marginBottom: 2 }}>
                      {selectedService.name}{extraServices.length > 0 ? ` + ${extraServices.length} more` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {isCash
                        ? <Banknote size={12} color="#4ade80" />
                        : <Smartphone size={12} color="#60a5fa" />}
                      <span style={{ fontSize: 11, color: isCash ? '#4ade80' : '#60a5fa', fontWeight: 600 }}>
                        {paymentMethod.toUpperCase()} · {isCash ? 'Cash' : 'Bank'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {totalDiscount > 0 && (
                      <div style={{ fontSize: 11, color: isDark ? 'rgba(56,30,114,0.7)' : 'rgba(255,255,255,0.65)', textDecoration: 'line-through' }}>
                        {formatCurrency(grossAmount)}
                      </div>
                    )}
                    <div style={{ fontSize: 24, fontWeight: 900, color: c.onPrimary }}>{formatCurrency(totalAmount)}</div>
                    {totalDiscount > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>−{formatCurrency(totalDiscount)} off</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button type="submit" disabled={isSubmitting}
              style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: c.primary, color: c.onPrimary, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isSubmitting ? 0.6 : 1 }}>
              {isSubmitting
                ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${isDark ? 'rgba(56,30,114,0.3)' : 'rgba(255,255,255,0.3)'}`, borderTopColor: c.onPrimary, animation: 'spin 0.8s linear infinite' }} />
                : <Play size={15} />}
              {isSubmitting ? 'Starting...' : 'Start Session'}
            </button>
          </form>
        </div>
      )}

      {/* Today's sessions */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 12 }}>Today's Sessions ({todayRecords.length})</div>
        {todayRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, background: c.surface, borderRadius: 12, border: `1px solid ${c.border}`, color: c.muted2, fontSize: 13 }}>No sessions today yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todayRecords.map(r => {
              const pm = (r as WorkRecordWithRelations & { payment_method?: string }).payment_method ?? 'cash'
              const pmIsCash = pm === 'cash'
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: c.surface, borderRadius: 12, border: `1px solid ${c.border}` }}>
                  {(r as WorkRecordWithRelations & { photo_url?: string }).photo_url && (
                    <img src={(r as WorkRecordWithRelations & { photo_url?: string }).photo_url} alt="work"
                      style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{(r.customers as { name: string })?.name}</div>
                    <div style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>
                      {(r.services as { name: string })?.name} · {formatTime(r.start_time)}{r.end_time ? ` – ${formatTime(r.end_time)}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{formatCurrency(r.amount)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 3 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                        background: pmIsCash ? c.successBg : c.infoBg,
                        color: pmIsCash ? c.successText : c.infoText
                      }}>
                        {pmIsCash ? <Banknote size={9} /> : <Smartphone size={9} />}
                        {pm.toUpperCase()}
                      </div>
                      {r.end_time && (
                        <div style={{ padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: c.successBg, color: c.successText }}>
                          {calculateDuration(r.start_time, r.end_time)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
