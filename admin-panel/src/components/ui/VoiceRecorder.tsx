import { useRef, useState } from 'react'
import { Mic, Square, X, Send } from 'lucide-react'
import toast from 'react-hot-toast'

interface VoiceRecorderProps {
  onSend: (blob: Blob, durationSeconds: number) => void | Promise<void>
  sending?: boolean
}

/**
 * A press-to-record voice note button. Idle: a mic icon.
 * Recording: shows a live timer + stop/cancel controls.
 * On stop, shows a small "send this clip?" confirmation before uploading.
 */
export function VoiceRecorder({ onSend, sending }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setPreviewBlob(blob)
        setPreviewUrl(URL.createObjectURL(blob))
        stopStream()
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setSeconds(0)
      setRecording(true)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      toast.error('Microphone access denied or unavailable')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    stopTimer()
  }

  const cancelPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewBlob(null)
    setPreviewUrl(null)
    setSeconds(0)
  }

  const confirmSend = async () => {
    if (!previewBlob) return
    await onSend(previewBlob, seconds)
    cancelPreview()
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (previewBlob && previewUrl) {
    return (
      <div className="bg-[#F3EDF7] dark:bg-[#2B2930] border border-[#E8DEF8] dark:border-[#382E48]" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 99 }}>
        <audio src={previewUrl} controls style={{ height: 30, maxWidth: 160 }} />
        <span className="text-[#79747E] dark:text-[#938F99]" style={{ fontSize: 11, fontWeight: 600 }}>{fmt(seconds)}</span>
        <button onClick={cancelPreview} title="Discard"
          className="bg-[#E8DEF8] dark:bg-[#382E48] text-[#49454F] dark:text-[#CAC4D0]"
          style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={13} />
        </button>
        <button onClick={confirmSend} disabled={sending} title="Send voice note"
          className="bg-[#6750A4] dark:bg-[#D0BCFF] text-white dark:text-[#381E72]"
          style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
          {sending ? <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <Send size={12} />}
        </button>
      </div>
    )
  }

  if (recording) {
    return (
      <button onClick={stopRecording}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 99, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', animation: 'pulse 1s infinite' }} />
        <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(seconds)}</span>
        <Square size={13} fill="white" />
      </button>
    )
  }

  return (
    <button onClick={startRecording} title="Record a voice note"
      className="border border-[#CAC4D0] dark:border-[#44474F] bg-white dark:bg-[#1D192B] text-[#6750A4] dark:text-[#D0BCFF]"
      style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <Mic size={16} />
    </button>
  )
}
