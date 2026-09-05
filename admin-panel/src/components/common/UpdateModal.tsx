import { useState, useEffect } from 'react'
import { Sparkles, Download, ArrowRight, ShieldCheck, X } from 'lucide-react'
import { useAppUpdate } from '../../hooks/useAppUpdate'

export function UpdateModal() {
  const { hasUpdate, currentVersion, latestVersion, releaseNotes, isForceUpdate, downloadAndInstall } = useAppUpdate()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (hasUpdate) {
      const dismissed = sessionStorage.getItem(`dismissed_update_${latestVersion}`)
      if (!dismissed || isForceUpdate) {
        setIsOpen(true)
      }
    }
  }, [hasUpdate, latestVersion, isForceUpdate])

  if (!isOpen || !hasUpdate) return null

  const handleDismiss = () => {
    if (isForceUpdate) return
    sessionStorage.setItem(`dismissed_update_${latestVersion}`, 'true')
    setIsOpen(false)
  }

  const handleUpdate = () => {
    downloadAndInstall()
    if (!isForceUpdate) {
      setIsOpen(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-[#1D192B] border border-[#9C6ADE]/40 rounded-3xl p-6 text-white shadow-2xl shadow-purple-950/60 overflow-hidden">
        {/* Glow effect */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-52 h-52 rounded-full bg-[#6750A4] blur-[80px] opacity-50" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 w-52 h-52 rounded-full bg-[#9C6ADE] blur-[80px] opacity-40" />

        {/* Close button if not forced */}
        {!isForceUpdate && (
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[#CAC4D0] hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}

        <div className="relative z-10 space-y-4">
          {/* Header Icon */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6750A4] to-[#9C6ADE] flex items-center justify-center shadow-lg shadow-purple-900/40">
            <Sparkles size={28} className="text-white animate-pulse" />
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldCheck size={13} /> Update Available
            </span>
            <h2 className="text-xl font-bold text-white">Nailuxe Studio v{latestVersion}</h2>
            <p className="text-xs text-[#C4B5E8] mt-0.5">
              You are currently on <strong className="text-white">v{currentVersion}</strong>. An upgrade is ready for your device.
            </p>
          </div>

          {/* Release Notes */}
          <div className="p-3.5 rounded-2xl bg-white/[0.06] border border-white/10 text-xs text-[#E6E0E9] space-y-1.5">
            <p className="font-semibold text-purple-200">What's New in this update:</p>
            <p className="text-[#C4B5E8] leading-relaxed whitespace-pre-wrap">{releaseNotes}</p>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={handleUpdate}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#6750A4] via-[#7F67BE] to-[#9C6ADE] text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all shadow-lg shadow-[#6750A4]/40 cursor-pointer"
            >
              <Download size={18} />
              <span>Download & Install Update</span>
              <ArrowRight size={16} className="ml-0.5" />
            </button>

            {!isForceUpdate && (
              <button
                onClick={handleDismiss}
                className="w-full py-2.5 rounded-xl bg-transparent hover:bg-white/5 text-xs font-semibold text-[#CAC4D0] hover:text-white transition-colors cursor-pointer"
              >
                Remind Me Later
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
