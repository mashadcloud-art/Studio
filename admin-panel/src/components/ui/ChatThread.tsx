import { useEffect, useRef, useState } from 'react'
import {
  Send, NotebookPen, Trash2, Maximize2, Minimize2, Camera, Image as ImageIcon, X, Loader2
} from 'lucide-react'
import { isToday, isYesterday, format } from 'date-fns'
import { useStaffNotes, useSendStaffNote } from '../../hooks/useStaffNotes'
import { useStaffById } from '../../hooks/useStaff'
import { uploadAudioToCloudinary, uploadMediaToCloudinary } from '../../lib/cloudinary'
import { VoiceRecorder } from './VoiceRecorder'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface ChatThreadProps {
  staffId: string
  staffName?: string
  currentSenderId: string
  currentSenderRole: 'admin' | 'staff'
  title?: string
  emptyLabel?: string
  height?: number | string
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d, yyyy')
}

function fmtDuration(s: number | null) {
  if (!s && s !== 0) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ChatThread({ staffId, staffName: propStaffName, currentSenderId, currentSenderRole, title, emptyLabel, height = 380 }: ChatThreadProps) {
  const qc = useQueryClient()
  const { data: notes = [], isLoading } = useStaffNotes(staffId)
  const { data: staffData } = useStaffById(staffId)
  const staffName = propStaffName || staffData?.name || 'Staff'
  const sendNote = useSendStaffNote(staffId)
  const [text, setText] = useState('')
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null)
  const [isOtherTyping, setIsOtherTyping] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastChannelRef = useRef<any>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [notes.length, isOtherTyping])

  // Realtime typing and deletion broadcast channel
  useEffect(() => {
    const channelName = `typing_${staffId}`
    const channel = supabase.channel(channelName)
    broadcastChannelRef.current = channel

    channel
      .on('broadcast', { event: 'typing' }, (payload: { payload?: { senderId?: string } }) => {
        if (payload.payload?.senderId && payload.payload.senderId !== currentSenderId) {
          setIsOtherTyping(true)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => {
            setIsOtherTyping(false)
          }, 2500)
        }
      })
      .on('broadcast', { event: 'message_deleted' }, () => {
        qc.invalidateQueries({ queryKey: ['staff_notes', staffId] })
      })
      .on('broadcast', { event: 'chat_cleared' }, () => {
        qc.invalidateQueries({ queryKey: ['staff_notes', staffId] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [staffId, currentSenderId, qc])

  const notifyTyping = () => {
    broadcastChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { senderId: currentSenderId },
    })
  }

  const handleDeleteMessage = async (noteId: string) => {
    if (!window.confirm('Delete this message?')) return
    try {
      const { error } = await db.from('staff_notes').delete().eq('id', noteId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['staff_notes', staffId] })
      broadcastChannelRef.current?.send({
        type: 'broadcast',
        event: 'message_deleted',
        payload: { noteId },
      })
      toast.success('Message deleted')
    } catch (e: any) {
      toast.error('Failed to delete: ' + e.message)
    }
  }

  const handleClearChat = async () => {
    if (!window.confirm('Clear entire chat history with this staff member?')) return
    try {
      const { error } = await db.from('staff_notes').delete().eq('staff_id', staffId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['staff_notes', staffId] })
      broadcastChannelRef.current?.send({
        type: 'broadcast',
        event: 'chat_cleared',
        payload: { staffId },
      })
      toast.success('Chat cleared')
    } catch (e: any) {
      toast.error('Failed to clear chat: ' + e.message)
    }
  }

  const handleSendText = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    try {
      await sendNote.mutateAsync({ senderId: currentSenderId, senderRole: currentSenderRole, message: trimmed })
    } catch (e: unknown) {
      toast.error((e as Error).message)
      setText(trimmed)
    }
  }

  const handleSendVoice = async (blob: Blob, durationSeconds: number) => {
    setUploadingVoice(true)
    try {
      const result = await uploadAudioToCloudinary(blob)
      await sendNote.mutateAsync({
        senderId: currentSenderId, senderRole: currentSenderRole,
        voiceUrl: result.secure_url, voiceDuration: durationSeconds,
      })
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
    setUploadingVoice(false)
  }

  const handleMediaUpload = async (file: File) => {
    setUploadingMedia(true)
    const isVideo = file.type.startsWith('video/')
    const toastId = toast.loading(isVideo ? 'Uploading video…' : 'Uploading image…')
    try {
      const result = await uploadMediaToCloudinary(file, 'nailuxe_chat_media')
      const tag = isVideo ? '[video]' : '[image]'
      await sendNote.mutateAsync({
        senderId: currentSenderId,
        senderRole: currentSenderRole,
        message: `${tag}${result.secure_url}`,
      })
      toast.success(isVideo ? 'Video sent' : 'Image sent', { id: toastId })
    } catch (e: unknown) {
      toast.error('Media upload failed: ' + (e as Error).message, { id: toastId })
    } finally {
      setUploadingMedia(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (mediaInputRef.current) mediaInputRef.current.value = ''
    }
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-col bg-white dark:bg-[#1D192B] overflow-hidden shadow-sm transition-all duration-200",
          isFullscreen
            ? "fixed inset-0 z-[9999] h-[100dvh] w-screen rounded-none border-none"
            : "rounded-2xl border border-[#E8DEF8] dark:border-[#382E48] w-full"
        )}
        style={{
          height: isFullscreen ? '100dvh' : (typeof height === 'number' ? `${height}px` : (height || '100%')),
          maxHeight: isFullscreen ? '100dvh' : (typeof height === 'number' ? `${height}px` : (height || '100%')),
          minHeight: 0,
        }}
      >
        {/* Chat Thread Header with Fullscreen and Clear Chat Options */}
        <div className={cn(
          "shrink-0 flex items-center justify-between border-b border-[#F3EDF7] dark:border-[#2B2930] bg-[#F3EDF7]/95 dark:bg-[#2B2930]/95 backdrop-blur-md transition-all",
          isFullscreen ? "pt-[max(env(safe-area-inset-top),46px)] pb-3 px-4 shadow-sm" : "py-2.5 px-3.5"
        )}>
          <div className="flex items-center gap-[7px]">
            <NotebookPen size={14} className="text-[#79747E] dark:text-[#938F99]" />
            <span className="text-xs font-bold text-[#1D1A22] dark:text-[#E6E0E9]">
              {title || (currentSenderRole === 'admin' ? `Chat with ${staffName}` : 'Messages')}
            </span>
            {isFullscreen && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#6750A4]/10 text-[#6750A4] dark:bg-[#D0BCFF]/20 dark:text-[#D0BCFF]">
                Full Screen
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {notes.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Clear all messages in this conversation"
              >
                <Trash2 size={12} />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg text-[#49454F] dark:text-[#CAC4D0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
              title={isFullscreen ? 'Exit Full Screen' : 'Expand Full Screen'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span className="text-[11px] hidden sm:inline">{isFullscreen ? 'Exit Full' : 'Expand'}</span>
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#FEF7FF] dark:bg-[#141218] p-3.5 flex flex-col gap-0.5"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.035) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        >
          {isLoading ? (
            <div className="text-center text-[#79747E] dark:text-[#938F99] text-xs py-5">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="text-center text-[#79747E] dark:text-[#938F99] text-xs py-5">
              {emptyLabel ?? 'No messages yet.'}
            </div>
          ) : (
            notes.map((n, i) => {
              const mine = n.sender_id === currentSenderId
              const prev = notes[i - 1]
              const isNewDay = !prev || dayLabel(prev.created_at) !== dayLabel(n.created_at)
              const isConsecutive = !isNewDay && prev && prev.sender_id === n.sender_id

              const msg = n.message || ''
              const isImageMsg = msg.startsWith('[image]')
              const isVideoMsg = msg.startsWith('[video]')
              const mediaUrl = isImageMsg || isVideoMsg ? msg.slice(7) : null

              return (
                <div key={n.id}>
                  {isNewDay && (
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 10px' }}>
                      <span
                        className="bg-white/85 dark:bg-[#2B2930]/85 text-[#79747E] dark:text-[#938F99] shadow-sm"
                        style={{
                          fontSize: 10, fontWeight: 700,
                          padding: '4px 12px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}
                      >
                        {dayLabel(n.created_at)}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: isConsecutive ? 2 : 10 }}>
                    <div
                      className={
                        mine
                          ? 'bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]'
                          : 'bg-white dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9] shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none'
                      }
                      style={{
                        maxWidth: '82%',
                        padding: n.voice_url ? '8px 10px' : (isImageMsg || isVideoMsg ? '6px' : '9px 13px'),
                        borderRadius: mine ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                      }}
                    >
                      {!mine && !isConsecutive && (
                        <p
                          className={cn("px-1", n.sender_role === 'admin' ? 'text-pink-600 dark:text-pink-400' : 'text-[#79747E] dark:text-[#938F99]')}
                          style={{ fontSize: 10, fontWeight: 700, marginBottom: 2 }}
                        >
                          {n.sender_role === 'admin' ? 'Owner' : staffName}
                        </p>
                      )}

                      {/* Photo message */}
                      {isImageMsg && mediaUrl && (
                        <div className="overflow-hidden rounded-xl bg-black/5 dark:bg-black/20 my-0.5">
                          <img
                            src={mediaUrl}
                            alt="Shared photo"
                            onClick={() => setSelectedPreviewImage(mediaUrl)}
                            className="max-h-64 max-w-full rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            loading="lazy"
                          />
                        </div>
                      )}

                      {/* Video message */}
                      {isVideoMsg && mediaUrl && (
                        <div className="overflow-hidden rounded-xl bg-black/10 dark:bg-black/30 my-0.5 max-w-[280px]">
                          <video
                            src={mediaUrl}
                            controls
                            playsInline
                            className="w-full max-h-64 rounded-xl"
                            preload="metadata"
                          />
                        </div>
                      )}

                      {/* Standard text message */}
                      {!isImageMsg && !isVideoMsg && n.message && (
                        <p style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {n.message}
                        </p>
                      )}

                      {/* Voice Note */}
                      {n.voice_url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <audio src={n.voice_url} controls style={{ height: 32, maxWidth: 200 }} />
                          {n.voice_duration != null && (
                            <span style={{ fontSize: 10, opacity: 0.7 }}>{fmtDuration(n.voice_duration)}</span>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4, paddingLeft: 4, paddingRight: 4 }}>
                        <span style={{ fontSize: 9, opacity: 0.65 }}>
                          {timeLabel(n.created_at)}
                        </span>
                        {mine && (
                          <span className="text-[#25D366] dark:text-[#4ADE80] font-black text-[12px] leading-none select-none tracking-tighter" title="Delivered & Seen">
                            ✓✓
                          </span>
                        )}
                        {(mine || currentSenderRole === 'admin') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteMessage(n.id)
                            }}
                            className={`p-1 -mr-1 rounded transition-colors cursor-pointer ${
                              mine
                                ? 'text-white/70 hover:text-white hover:bg-white/20'
                                : 'text-[#79747E] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                            }`}
                            title="Delete message"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {/* Realtime Typing Indicator */}
          {isOtherTyping && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#2B2930] rounded-2xl w-fit shadow-2xs border border-[#E8DEF8] dark:border-[#382E48] animate-in fade-in my-1">
              <span className="text-[11px] font-semibold text-[#6750A4] dark:text-[#D0BCFF]">
                {currentSenderRole === 'admin' ? `${staffName} is typing` : 'Owner is typing'}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[#6750A4] dark:bg-[#D0BCFF] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-[#6750A4] dark:bg-[#D0BCFF] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-[#6750A4] dark:bg-[#D0BCFF] rounded-full animate-bounce" />
              </span>
            </div>
          )}
        </div>

        {/* Hidden inputs for Camera & Media Gallery */}
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleMediaUpload(file)
          }}
        />
        <input
          type="file"
          ref={mediaInputRef}
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleMediaUpload(file)
          }}
        />

        {/* Input reply footer: always sticky and rock-solid visible at bottom */}
        <div className="shrink-0 sticky bottom-0 z-20 border-t border-[#E8DEF8] dark:border-[#382E48] bg-white/95 dark:bg-[#1D192B]/95 backdrop-blur-md px-2 sm:px-3 py-2 pb-[max(env(safe-area-inset-bottom),8px)] flex items-center gap-1.5 sm:gap-2 shadow-md">
          {/* Camera Button */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploadingMedia || sendNote.isPending}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F3EDF7] hover:bg-[#E8DEF8] dark:bg-[#2B2930] dark:hover:bg-[#382E48] text-[#49454F] dark:text-[#CAC4D0] flex items-center justify-center cursor-pointer shrink-0 transition-colors disabled:opacity-40 active:scale-95"
            title="Take Photo"
          >
            <Camera size={16} />
          </button>

          {/* Photo & Video Gallery Button */}
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            disabled={uploadingMedia || sendNote.isPending}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#F3EDF7] hover:bg-[#E8DEF8] dark:bg-[#2B2930] dark:hover:bg-[#382E48] text-[#49454F] dark:text-[#CAC4D0] flex items-center justify-center cursor-pointer shrink-0 transition-colors disabled:opacity-40 active:scale-95"
            title="Attach Image or Video"
          >
            {uploadingMedia ? <Loader2 size={16} className="animate-spin text-[#6750A4] dark:text-[#D0BCFF]" /> : <ImageIcon size={16} />}
          </button>

          {/* Voice Recorder */}
          <VoiceRecorder onSend={handleSendVoice} sending={uploadingVoice} />

          {/* Text Input */}
          <input
            type="text"
            value={text}
            onChange={e => {
              setText(e.target.value)
              notifyTyping()
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleSendText() }}
            placeholder="Type a message…"
            className="flex-1 min-w-0 border border-[#CAC4D0] dark:border-[#44474F] bg-[#F3EDF7] dark:bg-[#2B2930] text-[#1D1A22] dark:text-[#E6E0E9] rounded-full px-3.5 sm:px-4 py-2 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-[#6750A4] shadow-xs placeholder:text-[#79747E] dark:placeholder:text-[#938F99]"
          />

          {/* Send Button */}
          <button
            onClick={handleSendText}
            disabled={!text.trim() || sendNote.isPending}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#6750A4] hover:bg-[#523E85] dark:bg-[#D0BCFF] dark:hover:bg-[#EADDFF] text-white dark:text-[#381E72] flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-30 transition-all shadow-md active:scale-95"
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      {/* Lightbox Modal for Image Preview */}
      {selectedPreviewImage && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedPreviewImage(null)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Close preview"
          >
            <X size={20} />
          </button>
          <img
            src={selectedPreviewImage}
            alt="Full size view"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
