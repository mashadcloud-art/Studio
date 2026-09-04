import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!open) return null

  const sizeMap = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className={cn(
        'relative bg-white dark:bg-[#1D192B] rounded-[28px] w-full flex flex-col max-h-[90vh]',
        'shadow-2xl border border-[#E8DEF8] dark:border-[#382E48]',
        sizeMap[size]
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3EDF7] dark:border-[#2B2930]">
          <h2 className="text-base font-bold text-[#1D1A22] dark:text-[#E6E0E9] tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#79747E] dark:text-[#938F99] hover:text-[#1D1A22] dark:hover:text-[#E6E0E9] hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[#F3EDF7] dark:border-[#2B2930] flex justify-end gap-3 bg-[#FEF7FF]/50 dark:bg-[#141218]/50 rounded-b-[28px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#49454F] dark:text-[#CAC4D0] border border-[#CAC4D0] dark:border-[#44474F] rounded-full hover:bg-[#F3EDF7] dark:hover:bg-[#2B2930] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-[#6750A4] dark:bg-[#D0BCFF] dark:text-[#381E72] rounded-full hover:bg-[#7F67BE] dark:hover:bg-[#E8DEF8] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[#49454F] dark:text-[#CAC4D0] text-sm leading-relaxed">{message}</p>
    </Modal>
  )
}
