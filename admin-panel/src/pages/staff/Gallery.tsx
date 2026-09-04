import { useState, useRef, useMemo } from 'react'
import {
  Camera, Upload, Trash2, Sparkles, X, Plus, User, Tag,
  Calendar, ZoomIn, Pencil, Lightbulb, Image as ImageIcon,
  CheckCircle2, Wand2, Layers, ChevronRight, Users
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useStaffList } from '../../hooks/useStaff'
import { supabase } from '../../lib/supabase'
import { uploadToCloudinary } from '../../lib/cloudinary'
import { detectNailDesign, type DesignDetectionResult } from '../../lib/designDetector'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface GalleryItem {
  id: string
  image_url: string
  staff_id: string | null
  staff_name: string
  client_name?: string | null
  style_tag?: string | null
  notes?: string | null
  type?: 'showcase' | 'inspire'
  created_at: string
}

interface UploadQueueItem {
  id: string
  file: File
  previewUrl: string
  clientName: string
  styleTag: string
  detectedCategory: string
  confidence: number
  notes: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
}

const QUICK_TAGS = [
  'Cat Eye / Velvet',
  'French Polish / Ombre',
  'Chrome & Glazed',
  'Bridal & Luxury',
  'Detailed Nail Art',
  'Gel Extensions',
  'Gel Overlay',
  'Nude & Minimalist',
  'Vibrant Gel Polish',
  'Custom Set',
]

const CURATED_LOOKBOOK: GalleryItem[] = [
  {
    id: 'sample_1',
    image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80',
    staff_id: null,
    staff_name: 'Studio Lookbook',
    client_name: 'Bridal Inspiration',
    style_tag: 'Bridal & Luxury',
    notes: 'Soft blush pink base with subtle crystal accents and french tips.',
    type: 'inspire',
    created_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'sample_2',
    image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=800&q=80',
    staff_id: null,
    staff_name: 'Studio Lookbook',
    client_name: 'Velvet Cat Eye',
    style_tag: 'Cat Eye / Velvet',
    notes: 'Deep magnetic aurora velvet shimmer effect with reflective light.',
    type: 'inspire',
    created_at: '2026-09-01T11:00:00Z',
  },
  {
    id: 'sample_3',
    image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&q=80',
    staff_id: null,
    staff_name: 'Studio Lookbook',
    client_name: 'Chrome & Glazed',
    style_tag: 'Chrome & Glazed',
    notes: 'Hailey Bieber glazed donut chrome pearl finish over milky neutral.',
    type: 'inspire',
    created_at: '2026-09-01T12:00:00Z',
  },
  {
    id: 'sample_4',
    image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80',
    staff_id: null,
    staff_name: 'Studio Lookbook',
    client_name: 'French Ombre',
    style_tag: 'French Polish / Ombre',
    notes: 'Classic baby boomer gradient fade on almond gel extensions.',
    type: 'inspire',
    created_at: '2026-09-01T13:00:00Z',
  },
  {
    id: 'sample_5',
    image_url: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=800&q=80',
    staff_id: null,
    staff_name: 'Studio Lookbook',
    client_name: 'Detailed Nail Art',
    style_tag: 'Detailed Nail Art',
    notes: 'Hand-painted delicate botanical flora and gold foil lines.',
    type: 'inspire',
    created_at: '2026-09-01T14:00:00Z',
  },
  {
    id: 'sample_6',
    image_url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80',
    staff_id: null,
    staff_name: 'Studio Lookbook',
    client_name: 'Nude Minimalist',
    style_tag: 'Nude & Minimalist',
    notes: 'Clean girl sheer milky overlay with high-shine glass topcoat.',
    type: 'inspire',
    created_at: '2026-09-01T15:00:00Z',
  },
]

const CURATED_SHOWCASE: GalleryItem[] = [
  {
    id: 'starter_showcase_1',
    image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=800&q=80',
    staff_id: null,
    staff_name: 'NIMISHA',
    client_name: 'Priya Sharma',
    style_tag: 'Cat Eye / Velvet',
    notes: 'Magnetic cat-eye velvet shimmer on almond tips.',
    type: 'showcase',
    created_at: '2026-09-02T10:00:00Z',
  },
  {
    id: 'starter_showcase_2',
    image_url: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80',
    staff_id: null,
    staff_name: 'REJEENA',
    client_name: 'Ananya Verma',
    style_tag: 'Bridal & Luxury',
    notes: 'Blush pink with Swarovski crystals & French tips.',
    type: 'showcase',
    created_at: '2026-09-02T11:00:00Z',
  },
  {
    id: 'starter_showcase_3',
    image_url: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&q=80',
    staff_id: null,
    staff_name: 'SANIYA',
    client_name: 'Sneha Patel',
    style_tag: 'Chrome & Glazed',
    notes: 'Milky glazed donut chrome pearl finish.',
    type: 'showcase',
    created_at: '2026-09-02T12:00:00Z',
  },
  {
    id: 'starter_showcase_4',
    image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80',
    staff_id: null,
    staff_name: 'NIMISHA',
    client_name: 'Deepa Roy',
    style_tag: 'French Polish / Ombre',
    notes: 'Classic baby boomer ombre fade on almond gel extensions.',
    type: 'showcase',
    created_at: '2026-09-02T13:00:00Z',
  },
]

export function Gallery() {
  const { staff, isAdmin } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const qc = useQueryClient()

  const { data: allStaff = [] } = useStaffList()
  const [selectedArtistId, setSelectedArtistId] = useState<string>('all')

  // Top tabs: Studio Showcase (client jobs) vs Ideas & Inspiration (lookbook)
  const [mainTab, setMainTab] = useState<'showcase' | 'inspire'>('showcase')

  // Style Tag filter
  const [selectedTag, setSelectedTag] = useState<string>('all')

  // Bulk Upload Queue Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [commonTag, setCommonTag] = useState('')
  const [commonClient, setCommonClient] = useState('')

  // Fullscreen view modal
  const [viewItem, setViewItem] = useState<GalleryItem | null>(null)

  // Edit photo modal
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null)
  const [editClientName, setEditClientName] = useState('')
  const [editStyleTag, setEditStyleTag] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editType, setEditType] = useState<'showcase' | 'inspire'>('showcase')

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const bulkFileInputRef = useRef<HTMLInputElement>(null)

  // Fetch gallery items
  const { data: galleryItems = [], isLoading } = useQuery<GalleryItem[]>({
    queryKey: ['gallery_items'],
    queryFn: async () => {
      const { data, error } = await db
        .from('gallery')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Gallery fetch fallback:', error.message)
        const local = localStorage.getItem('nailuxe_local_gallery')
        return local ? JSON.parse(local) : []
      }
      return (data as GalleryItem[]) ?? []
    },
  })

  // Delete item mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('gallery').delete().eq('id', id)
      if (error) {
        const local = localStorage.getItem('nailuxe_local_gallery')
        if (local) {
          const items = JSON.parse(local).filter((it: GalleryItem) => it.id !== id)
          localStorage.setItem('nailuxe_local_gallery', JSON.stringify(items))
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery_items'] })
      toast.success('Photo removed from gallery.')
      setViewItem(null)
      setEditingItem(null)
    },
    onError: (err: Error) => toast.error(`Failed to delete: ${err.message}`),
  })

  // Edit item mutation
  const editMutation = useMutation({
    mutationFn: async (item: Partial<GalleryItem> & { id: string }) => {
      const { error } = await db
        .from('gallery')
        .update({
          client_name: item.client_name,
          style_tag: item.style_tag,
          notes: item.notes,
          type: item.type,
        })
        .eq('id', item.id)

      if (error) {
        const local = localStorage.getItem('nailuxe_local_gallery')
        if (local) {
          const items = JSON.parse(local).map((it: GalleryItem) =>
            it.id === item.id ? { ...it, ...item } : it
          )
          localStorage.setItem('nailuxe_local_gallery', JSON.stringify(items))
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery_items'] })
      toast.success('Photo details updated successfully!')
      setEditingItem(null)
      setViewItem(null)
    },
    onError: (err: Error) => toast.error(`Failed to update: ${err.message}`),
  })

  // Handle single camera snap or bulk selection
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    toast.loading('Analyzing designs & colors with AI…', { id: 'ai-detect', duration: 1500 })

    const queueItems: UploadQueueItem[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const previewUrl = URL.createObjectURL(file)

      let detectedCategory = 'Detailed Nail Art'
      let confidence = 85

      try {
        const detection: DesignDetectionResult = await detectNailDesign(file)
        detectedCategory = detection.detectedCategory
        confidence = Math.round(detection.confidence * 100)
      } catch (err) {
        console.warn('AI design detect fallback:', err)
      }

      queueItems.push({
        id: `upload_${Date.now()}_${i}`,
        file,
        previewUrl,
        clientName: '',
        styleTag: detectedCategory,
        detectedCategory,
        confidence,
        notes: '',
        progress: 0,
        status: 'pending',
      })
    }

    setUploadQueue(queueItems)
    setIsUploadModalOpen(true)
    toast.dismiss('ai-detect')
    toast.success(`✨ ${files.length} photo${files.length > 1 ? 's' : ''} auto-categorized!`)

    if (e.target) e.target.value = ''
  }

  // Batch apply tag or client to all in queue
  const applyTagToAll = (tag: string) => {
    setUploadQueue(prev => prev.map(item => ({ ...item, styleTag: tag })))
    setCommonTag(tag)
  }

  const applyClientToAll = (name: string) => {
    setUploadQueue(prev => prev.map(item => ({ ...item, clientName: name })))
    setCommonClient(name)
  }

  // Execute upload of all queued items
  const handleBatchUpload = async () => {
    if (uploadQueue.length === 0) return

    setIsUploading(true)
    let successCount = 0

    for (let i = 0; i < uploadQueue.length; i++) {
      const item = uploadQueue[i]

      setUploadQueue(prev =>
        prev.map((q, idx) => (idx === i ? { ...q, status: 'uploading', progress: 15 } : q))
      )

      try {
        // 1. Cloudinary upload
        const res = await uploadToCloudinary(item.file, 'nailuxe_gallery', pct => {
          setUploadQueue(prev =>
            prev.map((q, idx) => (idx === i ? { ...q, progress: pct } : q))
          )
        })

        // 2. Database save
        const newItem: Partial<GalleryItem> = {
          image_url: res.secure_url,
          staff_id: staff?.id ?? null,
          staff_name: staff?.name ?? (isAdmin ? 'Admin' : 'Salon Stylist'),
          client_name: item.clientName.trim() || null,
          style_tag: item.styleTag.trim() || 'General Style',
          notes: item.notes.trim() || null,
          type: mainTab,
        }

        const { error } = await db.from('gallery').insert(newItem)
        if (error) {
          const local = localStorage.getItem('nailuxe_local_gallery')
          const items = local ? JSON.parse(local) : []
          items.unshift({ ...newItem, id: 'local_' + Date.now() + '_' + i, created_at: new Date().toISOString() })
          localStorage.setItem('nailuxe_local_gallery', JSON.stringify(items))
        }

        setUploadQueue(prev =>
          prev.map((q, idx) => (idx === i ? { ...q, status: 'done', progress: 100 } : q))
        )
        successCount++
      } catch (err) {
        console.error('Upload failed for item', item.file.name, err)
        setUploadQueue(prev =>
          prev.map((q, idx) => (idx === i ? { ...q, status: 'error' } : q))
        )
      }
    }

    setIsUploading(false)
    qc.invalidateQueries({ queryKey: ['gallery_items'] })
    toast.success(`🎉 Successfully added ${successCount} photo${successCount > 1 ? 's' : ''} to ${mainTab === 'showcase' ? (isAdmin ? 'Studio Gallery' : 'My Work Gallery') : 'Inspiration Lookbook'}!`)
    setIsUploadModalOpen(false)
    setUploadQueue([])
  }

  // Open edit modal for an item
  const openEditModal = (item: GalleryItem) => {
    setEditingItem(item)
    setEditClientName(item.client_name || '')
    setEditStyleTag(item.style_tag || '')
    setEditNotes(item.notes || '')
    setEditType(item.type || 'showcase')
  }

  // Trigger helpers that guarantee clicking the native file input
  const triggerUpload = () => {
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.click()
    } else {
      const el = document.getElementById('gallery-bulk-upload') as HTMLInputElement
      el?.click()
    }
  }

  const triggerCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click()
    } else {
      const el = document.getElementById('gallery-camera-snap') as HTMLInputElement
      el?.click()
    }
  }

  // Merge uploaded items with starter showcase and curated lookbook samples
  const allDisplayItems = useMemo(() => {
    const userInspire = galleryItems.filter(i => i.type === 'inspire')
    const userShowcase = galleryItems.filter(i => (i.type || 'showcase') === 'showcase')

    const finalShowcase = userShowcase.length > 0 ? userShowcase : CURATED_SHOWCASE
    const finalInspire = [...userInspire, ...CURATED_LOOKBOOK]

    return [
      ...finalShowcase,
      ...finalInspire,
    ]
  }, [galleryItems])

  // Profile-based for staff vs Master Studio Gallery for admin
  const filteredItems = useMemo(() => {
    return allDisplayItems.filter(item => {
      // 1. Tab check ('showcase' or 'inspire')
      const itemType = item.type || 'showcase'
      if (itemType !== mainTab) return false

      // 2. Showcase view logic:
      if (mainTab === 'showcase') {
        if (!isAdmin && staff) {
          // STAFF VIEW: Show ONLY this staff member's photos (profile-based)
          const isMine = item.staff_id === staff.id || item.staff_name?.toLowerCase() === staff.name?.toLowerCase()
          if (!isMine) return false
        } else if (isAdmin) {
          // ADMIN VIEW: Can filter by specific artist or view all artists
          if (selectedArtistId !== 'all' && item.staff_id !== selectedArtistId && item.staff_name?.toLowerCase() !== allStaff.find(s => s.id === selectedArtistId)?.name.toLowerCase()) {
            return false
          }
        }
      }

      // 3. Category Tag check
      if (selectedTag !== 'all' && item.style_tag !== selectedTag) {
        return false
      }

      return true
    })
  }, [allDisplayItems, mainTab, isAdmin, staff, selectedArtistId, allStaff, selectedTag])

  const showcaseCount = filteredItems.filter(i => (i.type || 'showcase') === 'showcase').length
  const inspireCount = allDisplayItems.filter(i => i.type === 'inspire').length

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-16">
      {/* Native file inputs with bound refs */}
      <input
        id="gallery-camera-snap"
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFilesSelected}
      />
      <input
        id="gallery-bulk-upload"
        ref={bulkFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFilesSelected}
      />

      {/* ── TOP HEADER BAR: TITLE & ACTIONS ────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#1D1A22] dark:text-[#E6E0E9] tracking-tight flex items-center gap-2">
            <span>{isAdmin ? 'Master Studio Gallery' : `${staff?.name ?? 'My'} Work Gallery`}</span>
            {!isAdmin && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#6750A4] text-white">
                MY WORK
              </span>
            )}
          </h1>
          <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-0.5">
            {isAdmin
              ? 'View all nail sets completed across all stylists, or switch to Ideas Lookbook'
              : 'Photos of nail sets & artistry you completed for your clients'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Showcase vs Inspire Tab Switcher */}
          <div className="inline-flex bg-[#F3EDF7] dark:bg-[#2B2930] p-1 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
            <button
              onClick={() => { setMainTab('showcase'); setSelectedTag('all') }}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                mainTab === 'showcase'
                  ? 'bg-[#6750A4] text-white shadow-sm dark:bg-[#D0BCFF] dark:text-[#381E72]'
                  : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-black/5'
              }`}
            >
              <ImageIcon size={13} />
              <span>{isAdmin ? 'All Works' : 'My Sets'}</span>
              <span className="text-[10px] opacity-80">({showcaseCount})</span>
            </button>

            <button
              onClick={() => { setMainTab('inspire'); setSelectedTag('all') }}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                mainTab === 'inspire'
                  ? 'bg-[#6750A4] text-white shadow-sm dark:bg-[#D0BCFF] dark:text-[#381E72]'
                  : 'text-[#49454F] dark:text-[#CAC4D0] hover:bg-black/5'
              }`}
            >
              <Lightbulb size={13} className={mainTab === 'inspire' ? 'text-amber-300' : ''} />
              <span>Inspire Ideas</span>
              <span className="text-[10px] opacity-80">({inspireCount})</span>
            </button>
          </div>

          {/* Snap & Upload Buttons */}
          <button
            type="button"
            onClick={triggerCamera}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6750A4] to-[#7950A4] text-white text-xs font-bold shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer select-none"
            title="Snap client photo with camera"
          >
            <Camera size={14} />
            <span className="text-xs">Snap</span>
          </button>

          <button
            type="button"
            onClick={triggerUpload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] text-[#1D1A22] dark:text-[#E6E0E9] text-xs font-bold shadow-2xs hover:bg-[#F3EDF7] active:scale-95 transition-all cursor-pointer select-none"
            title="Upload multiple photos"
          >
            <Upload size={14} />
            <span className="text-xs">Upload</span>
          </button>
        </div>
      </div>

      {/* ── ADMIN ARTIST FILTER BAR (SEPARATE GALLERY FOR ADMIN) ──── */}
      {isAdmin && mainTab === 'showcase' && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-1 bg-[#F3EDF7]/60 dark:bg-[#2B2930]/60 p-1.5 rounded-2xl border border-[#E8DEF8] dark:border-[#382E48]">
          <span className="text-xs font-bold text-[#6750A4] dark:text-[#D0BCFF] flex items-center gap-1 shrink-0 px-1">
            <Users size={13} /> Filter Stylist:
          </span>
          <button
            onClick={() => setSelectedArtistId('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedArtistId === 'all'
                ? 'bg-[#6750A4] text-white shadow-xs dark:bg-[#D0BCFF] dark:text-[#381E72]'
                : 'bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0] border border-[#E8DEF8] dark:border-[#382E48]'
            }`}
          >
            All Artists ({galleryItems.filter(i => (i.type || 'showcase') === 'showcase').length})
          </button>
          {allStaff.map(st => {
            const count = galleryItems.filter(i => (i.type || 'showcase') === 'showcase' && (i.staff_id === st.id || i.staff_name?.toLowerCase() === st.name?.toLowerCase())).length
            return (
              <button
                key={st.id}
                onClick={() => setSelectedArtistId(st.id)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                  selectedArtistId === st.id
                    ? 'bg-[#6750A4] text-white shadow-xs dark:bg-[#D0BCFF] dark:text-[#381E72]'
                    : 'bg-white dark:bg-[#1D192B] text-[#49454F] dark:text-[#CAC4D0] border border-[#E8DEF8] dark:border-[#382E48]'
                }`}
              >
                <span>{st.name}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── STYLE TAG FILTERS (NO UGLY SCROLLBARS) ──── */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-1">
        <button
          onClick={() => setSelectedTag('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
            selectedTag === 'all'
              ? 'bg-[#1D1A22] text-white dark:bg-white dark:text-[#1D1A22]'
              : 'bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0] hover:bg-black/5'
          }`}
        >
          All Styles
        </button>

        {QUICK_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag === selectedTag ? 'all' : tag)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              selectedTag === tag
                ? 'bg-[#6750A4] text-white dark:bg-[#D0BCFF] dark:text-[#381E72]'
                : 'bg-[#F3EDF7] dark:bg-[#2B2930] text-[#49454F] dark:text-[#CAC4D0] hover:bg-black/5'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Showcase / Lookbook Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-[#79747E] dark:text-[#938F99]">
          Loading nail art photos…
        </div>
      ) : filteredItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => setViewItem(item)}
              className="group relative rounded-3xl overflow-hidden bg-white dark:bg-[#1D192B] border border-[#E8DEF8] dark:border-[#382E48] shadow-2xs hover:shadow-xl transition-all cursor-pointer flex flex-col"
            >
              {/* Photo */}
              <div className="relative aspect-4/5 w-full overflow-hidden bg-[#2B2930]">
                <img
                  src={item.image_url}
                  alt={item.style_tag || 'Nail work'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-90 group-hover:opacity-95 transition-opacity" />

                {/* Edit & Zoom Action Hints on Hover */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      openEditModal(item)
                    }}
                    className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-[#6750A4] transition-colors"
                    title="Edit details / change customer or tag"
                  >
                    <Pencil size={13} />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center">
                    <ZoomIn size={14} />
                  </div>
                </div>

                {/* Bottom Overlay Info: Customer Name, Artist Name, Design Style */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                  {/* Design / Style Badge */}
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-[#6750A4] text-white uppercase tracking-wider shadow-xs">
                      ✨ {item.style_tag || 'Nail Art'}
                    </span>
                  </div>

                  {/* Customer Name */}
                  <p className="text-xs font-black truncate flex items-center gap-1 text-white">
                    <span>👤</span>
                    <span>{item.client_name ? item.client_name : (item.type === 'inspire' ? 'Design Reference' : 'Client Job')}</span>
                  </p>

                  {/* Artist Name */}
                  <p className="text-[11px] text-white/90 font-bold flex items-center gap-1 mt-0.5">
                    <span>💅 Artist:</span>
                    <strong className="text-amber-300 font-black">{item.staff_name}</strong>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl p-12 text-center bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48]">
          <div className="w-16 h-16 rounded-2xl bg-[#6750A4]/15 text-[#6750A4] dark:text-[#D0BCFF] flex items-center justify-center mx-auto mb-3">
            {mainTab === 'showcase' ? <Camera size={28} /> : <Lightbulb size={28} />}
          </div>
          <h3 className="text-base font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
            {mainTab === 'showcase' ? 'No showcase photos here yet' : 'No inspiration ideas uploaded yet'}
          </h3>
          <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-1 max-w-sm mx-auto">
            {mainTab === 'showcase'
              ? 'Snap photos of your completed sets and nail artistry to build your salon portfolio.'
              : 'Upload reference designs, trending styles, and lookbook images to show clients.'}
          </p>
          <button
            type="button"
            onClick={triggerUpload}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#6750A4] text-white text-xs font-bold hover:opacity-90 shadow-md active:scale-95 cursor-pointer"
          >
            <Upload size={15} />
            <span>Upload Photos</span>
          </button>
        </div>
      )}

      {/* ── BULK / AI UPLOAD QUEUE MODAL ─────────────────────────────── */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-[#1D192B] rounded-3xl p-5 sm:p-7 w-full max-w-3xl border border-[#E8DEF8] dark:border-[#382E48] shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-[#E8DEF8] dark:border-[#382E48] pb-4">
              <div>
                <h3 className="text-lg font-black text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-2">
                  <Wand2 size={18} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                  <span>Bulk Upload & AI Design Categorizer</span>
                </h3>
                <p className="text-xs text-[#79747E] dark:text-[#938F99] mt-0.5">
                  Uploading to <strong className="text-[#6750A4] dark:text-[#D0BCFF] capitalize">{mainTab}</strong> · {uploadQueue.length} photo{uploadQueue.length !== 1 ? 's' : ''} queued
                </p>
              </div>
              <button
                onClick={() => { if (!isUploading) setIsUploadModalOpen(false) }}
                className="w-8 h-8 rounded-full bg-[#F3EDF7] dark:bg-[#2B2930] text-[#79747E] flex items-center justify-center hover:text-black dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Batch Autofill Toolbar */}
            {uploadQueue.length > 1 && (
              <div className="p-3.5 rounded-2xl bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48] flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-[#6750A4] dark:text-[#D0BCFF] flex items-center gap-1">
                  <Layers size={14} /> Batch Settings:
                </span>
                <input
                  type="text"
                  placeholder="Set Client Name for all..."
                  value={commonClient}
                  onChange={e => applyClientToAll(e.target.value)}
                  className="py-1.5 px-3 rounded-lg text-xs bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] outline-none text-[#1D1A22] dark:text-[#E6E0E9]"
                />
                <select
                  value={commonTag}
                  onChange={e => applyTagToAll(e.target.value)}
                  className="py-1.5 px-3 rounded-lg text-xs bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] outline-none text-[#1D1A22] dark:text-[#E6E0E9]"
                >
                  <option value="">Apply Style Tag to All...</option>
                  {QUICK_TAGS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Queue Items Grid */}
            <div className="max-h-[50vh] overflow-y-auto space-y-3.5 pr-1">
              {uploadQueue.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-[#F9F7FA] dark:bg-[#25222E] border border-[#E8DEF8] dark:border-[#382E48] flex flex-col sm:flex-row items-start sm:items-center gap-4"
                >
                  {/* Thumbnail */}
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-black/10 border border-black/10">
                    <img src={item.previewUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                    {item.status === 'done' && (
                      <div className="absolute inset-0 bg-emerald-600/80 text-white flex items-center justify-center">
                        <CheckCircle2 size={24} />
                      </div>
                    )}
                  </div>

                  {/* Form Inputs & AI Detection */}
                  <div className="flex-1 min-w-0 w-full space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {/* AI Detection Badge */}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#6750A4]/15 text-[#6750A4] dark:text-[#D0BCFF] border border-[#6750A4]/30">
                        <Sparkles size={12} className="text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
                        <span>AI Detected: {item.detectedCategory}</span>
                        <span className="opacity-70">({item.confidence}%)</span>
                      </span>

                      {/* Remove from queue button */}
                      {!isUploading && (
                        <button
                          onClick={() => setUploadQueue(prev => prev.filter((_, idx) => idx !== index))}
                          className="text-red-500 hover:text-red-700 text-xs font-bold"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Client Name (optional)"
                        value={item.clientName}
                        onChange={e => {
                          const val = e.target.value
                          setUploadQueue(prev =>
                            prev.map((q, idx) => (idx === index ? { ...q, clientName: val } : q))
                          )
                        }}
                        className="py-1.5 px-3 rounded-lg text-xs bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] outline-none text-[#1D1A22] dark:text-[#E6E0E9]"
                      />

                      <select
                        value={item.styleTag}
                        onChange={e => {
                          const val = e.target.value
                          setUploadQueue(prev =>
                            prev.map((q, idx) => (idx === index ? { ...q, styleTag: val } : q))
                          )
                        }}
                        className="py-1.5 px-3 rounded-lg text-xs bg-white dark:bg-[#1D192B] border border-[#CAC4D0] dark:border-[#44474F] outline-none text-[#1D1A22] dark:text-[#E6E0E9] font-medium"
                      >
                        {QUICK_TAGS.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Progress Bar */}
                    {item.status === 'uploading' && (
                      <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden mt-1">
                        <div className="h-full bg-[#6750A4] transition-all duration-200" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8DEF8] dark:border-[#382E48]">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setIsUploadModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-[#CAC4D0] dark:border-[#44474F] text-xs font-bold text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#F3EDF7]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUploading || uploadQueue.length === 0}
                onClick={handleBatchUpload}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6750A4] to-[#7950A4] text-white text-xs font-bold shadow-md hover:opacity-95 disabled:opacity-50 flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Uploading {uploadQueue.length} Photos…</span>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>Confirm & Upload All ({uploadQueue.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT PHOTO DETAILS MODAL ─────────────────────────────── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1D192B] rounded-3xl p-5 sm:p-6 w-full max-w-md border border-[#E8DEF8] dark:border-[#382E48] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#1D1A22] dark:text-[#E6E0E9] flex items-center gap-2">
                <Pencil size={16} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                <span>Edit Photo Details</span>
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="w-8 h-8 rounded-full bg-[#F3EDF7] dark:bg-[#2B2930] text-[#79747E] flex items-center justify-center hover:text-black dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Thumbnail */}
            <div className="w-full h-36 rounded-2xl overflow-hidden bg-black/10 border border-black/10">
              <img src={editingItem.image_url} alt="Edit" className="w-full h-full object-cover" />
            </div>

            <div className="space-y-3">
              {/* Category Section: Showcase vs Inspire */}
              <div>
                <label className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider">
                  Gallery Section
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setEditType('showcase')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      editType === 'showcase'
                        ? 'bg-[#6750A4] text-white border-[#6750A4]'
                        : 'border-[#CAC4D0] dark:border-[#44474F] text-[#49454F] dark:text-[#CAC4D0]'
                    }`}
                  >
                    Studio Showcase
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType('inspire')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      editType === 'inspire'
                        ? 'bg-[#6750A4] text-white border-[#6750A4]'
                        : 'border-[#CAC4D0] dark:border-[#44474F] text-[#49454F] dark:text-[#CAC4D0]'
                    }`}
                  >
                    Inspire Lookbook
                  </button>
                </div>
              </div>

              {/* Client Name */}
              <div>
                <label className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider">
                  Customer / Client Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Priya, Diya..."
                  value={editClientName}
                  onChange={e => setEditClientName(e.target.value)}
                  className="w-full mt-1 py-2.5 px-3.5 rounded-xl border border-[#E8DEF8] dark:border-[#44474F] bg-[#F3EDF7] dark:bg-[#2B2930] text-sm text-[#1D1A22] dark:text-[#E6E0E9] outline-none focus:ring-2 focus:ring-[#6750A4]"
                />
              </div>

              {/* Style Tag */}
              <div>
                <label className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider">
                  Style / Design Category
                </label>
                <input
                  type="text"
                  placeholder="Select or enter style tag"
                  value={editStyleTag}
                  onChange={e => setEditStyleTag(e.target.value)}
                  className="w-full mt-1 py-2.5 px-3.5 rounded-xl border border-[#E8DEF8] dark:border-[#44474F] bg-[#F3EDF7] dark:bg-[#2B2930] text-sm text-[#1D1A22] dark:text-[#E6E0E9] outline-none focus:ring-2 focus:ring-[#6750A4]"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_TAGS.slice(0, 6).map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setEditStyleTag(tag)}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E8DEF8] dark:bg-[#382E48] text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#6750A4] hover:text-white transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-bold text-[#79747E] dark:text-[#938F99] uppercase tracking-wider">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Add details about techniques, colors, or customer preferences..."
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="w-full mt-1 py-2 px-3.5 rounded-xl border border-[#E8DEF8] dark:border-[#44474F] bg-[#F3EDF7] dark:bg-[#2B2930] text-sm text-[#1D1A22] dark:text-[#E6E0E9] outline-none focus:ring-2 focus:ring-[#6750A4] resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (confirm('Delete this photo permanently?')) {
                    deleteMutation.mutate(editingItem.id)
                  }
                }}
                className="p-3 text-red-500 hover:text-red-700 transition-colors"
                title="Delete Photo"
              >
                <Trash2 size={18} />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="py-2.5 px-4 rounded-xl border border-[#CAC4D0] dark:border-[#44474F] text-xs font-bold text-[#49454F] dark:text-[#CAC4D0] hover:bg-[#F3EDF7]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editMutation.mutate({
                      id: editingItem.id,
                      client_name: editClientName.trim() || null,
                      style_tag: editStyleTag.trim() || 'General Style',
                      notes: editNotes.trim() || null,
                      type: editType,
                    })
                  }}
                  disabled={editMutation.isPending}
                  className="py-2.5 px-5 rounded-xl bg-[#6750A4] text-white text-xs font-bold shadow-md hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {editMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FULLSCREEN PHOTO VIEW MODAL ─────────────────────────────── */}
      {viewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setViewItem(null)}
        >
          <div
            className="relative bg-white dark:bg-[#1D192B] rounded-3xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            {/* Action Buttons Header */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={() => openEditModal(viewItem)}
                className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-[#6750A4] transition-colors shadow-lg"
                title="Edit customer or style tag"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => setViewItem(null)}
                className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 transition-colors shadow-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Image Preview */}
            <div className="relative bg-black flex items-center justify-center max-h-[60vh] overflow-hidden">
              <img
                src={viewItem.image_url}
                alt={viewItem.style_tag || 'Work photo'}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Info Footer */}
            <div className="p-5 sm:p-6 space-y-3 bg-white dark:bg-[#1D192B]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {viewItem.style_tag && (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-[#6750A4] text-white uppercase">
                        {viewItem.style_tag}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8DEF8] dark:bg-[#382E48] text-[#49454F] dark:text-[#CAC4D0] uppercase">
                      {viewItem.type === 'inspire' ? '💡 Inspiration Idea' : '📸 Studio Job'}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-[#1D1A22] dark:text-[#E6E0E9]">
                    {viewItem.client_name ? `Client: ${viewItem.client_name}` : 'Nail Art Showcase'}
                  </h3>
                </div>

                {/* Edit button */}
                <button
                  onClick={() => openEditModal(viewItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F3EDF7] dark:bg-[#2B2930] text-[#6750A4] dark:text-[#D0BCFF] text-xs font-bold hover:bg-[#E8DEF8] transition-colors"
                >
                  <Pencil size={13} />
                  <span>Edit Details</span>
                </button>
              </div>

              {viewItem.notes && (
                <p className="text-xs text-[#49454F] dark:text-[#CAC4D0]">
                  {viewItem.notes}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-[#79747E] dark:text-[#938F99] pt-2 border-t border-[#E8DEF8] dark:border-[#382E48]">
                <span className="flex items-center gap-1.5 font-medium">
                  <User size={13} className="text-[#6750A4] dark:text-[#D0BCFF]" />
                  Uploaded by: <strong className="text-[#1D1A22] dark:text-[#E6E0E9]">{viewItem.staff_name}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} />
                  {format(parseISO(viewItem.created_at), 'd MMM yyyy, h:mm a')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
