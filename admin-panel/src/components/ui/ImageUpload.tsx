import { useState, useRef } from 'react'
import { Camera, Upload, X, ImageIcon, Loader2 } from 'lucide-react'
import { uploadToCloudinary, isCloudinaryConfigured } from '../../lib/cloudinary'
import toast from 'react-hot-toast'

interface ImageUploadProps {
  value?: string | null
  onChange: (url: string | null) => void
  folder?: string
  size?: 'sm' | 'md' | 'lg' | 'avatar'
  label?: string
  allowCamera?: boolean
  placeholder?: string
}

export function ImageUpload({
  value,
  onChange,
  folder = 'nailuxe',
  size = 'md',
  label,
  allowCamera = true,
  placeholder = 'Upload photo',
}: ImageUploadProps) {
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const sizeMap = {
    sm:     { w: 64,  h: 64,  text: 11, icon: 14 },
    md:     { w: 120, h: 120, text: 12, icon: 18 },
    lg:     { w: '100%' as const, h: 180, text: 13, icon: 22 },
    avatar: { w: 96,  h: 96,  text: 11, icon: 16 },
  }
  const sz = sizeMap[size]

  const handleFile = async (file: File) => {
    if (!isCloudinaryConfigured()) {
      toast.error('Cloudinary not configured. Add keys to .env file.')
      return
    }

    // Validate
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large. Max 10MB.')
      return
    }

    setUploading(true)
    setProgress(0)
    try {
      const result = await uploadToCloudinary(file, folder, (p) => setProgress(p))
      onChange(result.secure_url)
      toast.success('Photo uploaded!')
    } catch (e: unknown) {
      toast.error(`Upload failed: ${(e as Error).message}`)
    }
    setUploading(false)
    setProgress(0)
  }

  return (
    <div>
      {label && (
        <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          {label}
        </div>
      )}

      {/* Hidden inputs */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {value ? (
        /* Show uploaded image */
        <div className="border-2 border-[#E8DEF8] dark:border-[#382E48]" style={{
          position: 'relative', display: 'inline-block',
          width: sz.w, height: sz.h,
          borderRadius: size === 'avatar' ? '50%' : size === 'lg' ? 12 : 10,
          overflow: 'hidden',
        }}>
          <img src={value} alt="Uploaded" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 8%', transform: 'scale(1.9)', transformOrigin: 'center 12%' }} />

          {/* Overlay on hover */}
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'background 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0)')}>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="bg-white dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9]"
              style={{ border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              title="Change photo">
              <Upload size={14} />
            </button>
            <button type="button" onClick={() => onChange(null)}
              style={{ background: '#ef4444', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, color: 'white' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              title="Remove photo">
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        /* Upload button */
        <div
          className={uploading ? 'bg-[#F3EDF7] dark:bg-[#2B2930]' : 'bg-white dark:bg-[#1D192B]'}
          style={{
            width: sz.w, height: sz.h,
            borderRadius: size === 'avatar' ? '50%' : size === 'lg' ? 12 : 10,
            border: '1.5px dashed #CAC4D0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, cursor: uploading ? 'not-allowed' : 'pointer',
            transition: 'all 0.1s',
            overflow: 'hidden',
          }}
          onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLDivElement).style.borderColor = '#6750A4' }}
          onMouseLeave={e => { if (!uploading) (e.currentTarget as HTMLDivElement).style.borderColor = '#CAC4D0' }}>

          {uploading ? (
            <>
              <Loader2 size={sz.icon} className="text-[#79747E] dark:text-[#938F99]" style={{ animation: 'spin 1s linear infinite' }} />
              <div className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: sz.text, fontWeight: 600 }}>{progress}%</div>
              {size === 'lg' && (
                <div className="bg-[#CAC4D0] dark:bg-[#44474F]" style={{ width: '60%', height: 3, borderRadius: 99, marginTop: 4 }}>
                  <div className="bg-[#6750A4] dark:bg-[#D0BCFF]" style={{ height: '100%', borderRadius: 99, width: `${progress}%`, transition: 'width 0.2s' }} />
                </div>
              )}
            </>
          ) : (
            <>
              <ImageIcon size={sz.icon} className="text-[#79747E] dark:text-[#938F99]" />
              {size !== 'sm' && (
                <span className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: sz.text, fontWeight: 500, textAlign: 'center', padding: '0 8px' }}>
                  {placeholder}
                </span>
              )}
              {size === 'lg' && allowCamera && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#79747E] dark:text-[#938F99]"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    <Upload size={12} /> Gallery
                  </button>
                  <button type="button" onClick={() => cameraRef.current?.click()}
                    className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#79747E] dark:text-[#938F99]"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    <Camera size={12} /> Camera
                  </button>
                </div>
              )}
              {size !== 'lg' && (
                <div onClick={() => fileRef.current?.click()} style={{ position: 'absolute', inset: 0 }} />
              )}
            </>
          )}
        </div>
      )}

      {/* Cloudinary not configured warning */}
      {!isCloudinaryConfigured() && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#f59e0b', fontWeight: 500 }}>
          ⚠️ Add Cloudinary keys to .env to enable uploads
        </div>
      )}
    </div>
  )
}
