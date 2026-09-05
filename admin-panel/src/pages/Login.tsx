import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, Lock, Eye, EyeOff, Fingerprint, KeyRound, CheckCircle2 } from 'lucide-react'
import { Preferences } from '@capacitor/preferences'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  isBiometricSupported,
  isBiometricEnabled,
  enableBiometricLogin,
  authenticateWithBiometrics,
} from '../lib/biometrics'

const schema = z.object({
  email: z.string().min(1, 'Email required'),
  password: z.string().min(1, 'Password required'),
})
type FormData = z.infer<typeof schema>

export function Login() {
  const navigate = useNavigate()
  const { user, staff, loading: authLoading } = useAuth()
  const [showPass, setShowPass] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [canBiometric, setCanBiometric] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [autoLogin, setAutoLogin] = useState(true)
  const [savedEmailDetected, setSavedEmailDetected] = useState<string | null>(null)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // 1. If user is ALREADY logged in from previous session, skip login immediately!
  useEffect(() => {
    if (!authLoading && user && staff) {
      if (staff.role === 'admin') navigate('/dashboard', { replace: true })
      else navigate('/my-profile', { replace: true })
    }
  }, [user, staff, authLoading, navigate])

  // 2. Load saved credentials from native Android SharedPreferences + localStorage
  useEffect(() => {
    async function loadSavedCredentials() {
      try {
        const { value: pEmail } = await Preferences.get({ key: 'nailuxe_saved_email' })
        const { value: pPass } = await Preferences.get({ key: 'nailuxe_saved_password' })
        const { value: pAuto } = await Preferences.get({ key: 'nailuxe_auto_login' })

        const lEmail = localStorage.getItem('nailuxe_saved_email')
        const lPass = localStorage.getItem('nailuxe_saved_password')
        const lAuto = localStorage.getItem('nailuxe_auto_login')

        const finalEmail = pEmail || lEmail || ''
        const finalPass = pPass || lPass || ''
        const shouldAutoLogin = (pAuto ?? lAuto) !== 'false'

        setAutoLogin(shouldAutoLogin)

        if (finalEmail) {
          setValue('email', finalEmail, { shouldValidate: true })
          setSavedEmailDetected(finalEmail)
        }
        if (finalPass) {
          setValue('password', finalPass, { shouldValidate: true })
        }

        // Check if user just manually logged out; don't loop
        const manualLogout = sessionStorage.getItem('nailuxe_manual_logout') === 'true'

        // 3. Auto sign-in if credentials exist, auto-login is true, and not manual logout
        if (finalEmail && finalPass && shouldAutoLogin && !manualLogout && !user && !authLoading) {
          doSignIn(finalEmail, finalPass)
        }
      } catch (err) {
        console.warn('Failed loading saved credentials:', err)
      }
    }

    loadSavedCredentials()
  }, [setValue, user, authLoading])

  // 4. Check if biometric is available and previously enabled on device
  useEffect(() => {
    isBiometricSupported().then(supported => {
      if (supported) {
        isBiometricEnabled().then(enabled => {
          setCanBiometric(enabled)
          if (enabled) {
            handleBiometricLogin()
          }
        })
      }
    })
  }, [])

  const handleClearSaved = async () => {
    try {
      await Preferences.remove({ key: 'nailuxe_saved_email' })
      await Preferences.remove({ key: 'nailuxe_saved_password' })
      await Preferences.remove({ key: 'nailuxe_auto_login' })
      localStorage.removeItem('nailuxe_saved_email')
      localStorage.removeItem('nailuxe_saved_password')
      localStorage.removeItem('nailuxe_auto_login')
      setValue('email', '')
      setValue('password', '')
      setSavedEmailDetected(null)
    } catch {
      // ignore
    }
  }

  const doSignIn = async (email: string, pass: string) => {
    setErrorMsg('')
    setLoading(true)
    sessionStorage.removeItem('nailuxe_manual_logout')

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      })

      if (error) { setErrorMsg(error.message); return }
      if (!authData?.user) { setErrorMsg('Login failed'); return }

      // Save for future 1-tap fingerprint logins if supported
      isBiometricSupported().then(supported => {
        if (supported) {
          enableBiometricLogin(email.trim(), pass)
        }
      })

      // Save credentials for Remember Me & Auto-Login
      try {
        if (rememberMe) {
          await Preferences.set({ key: 'nailuxe_saved_email', value: email.trim() })
          await Preferences.set({ key: 'nailuxe_saved_password', value: pass })
          await Preferences.set({ key: 'nailuxe_auto_login', value: autoLogin ? 'true' : 'false' })

          localStorage.setItem('nailuxe_saved_email', email.trim())
          localStorage.setItem('nailuxe_saved_password', pass)
          localStorage.setItem('nailuxe_auto_login', autoLogin ? 'true' : 'false')
        } else {
          await handleClearSaved()
        }
      } catch (e) {
        console.warn('Error saving credentials:', e)
      }

      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('role, active')
        .eq('id', authData.user.id)
        .single() as { data: { role: string; active: boolean } | null; error: unknown }

      if (staffError || !staff) {
        setErrorMsg(`Staff profile not found: ${(staffError as { message?: string })?.message ?? 'unknown'}`)
        await supabase.auth.signOut()
        return
      }

      if (staff.role === 'admin') navigate('/dashboard', { replace: true })
      else navigate('/my-profile', { replace: true })

    } catch (e: unknown) {
      setErrorMsg((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleBiometricLogin = async () => {
    try {
      const creds = await authenticateWithBiometrics()
      if (creds) {
        await doSignIn(creds.email, creds.password)
      }
    } catch {
      // biometric cancelled or dismissed by user
    }
  }

  const onSubmit = async (data: FormData) => {
    await doSignIn(data.email, data.password)
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0B0618] flex items-center justify-center p-6">
      {/* Glowing orbs */}
      <div className="pointer-events-none absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-[#6750A4] blur-[140px] opacity-40" />
      <div className="pointer-events-none absolute top-1/4 -right-28 w-[380px] h-[380px] rounded-full bg-[#9C6ADE] blur-[130px] opacity-30" />
      <div className="pointer-events-none absolute bottom-[-140px] left-1/3 w-[460px] h-[460px] rounded-full bg-[#381E72] blur-[150px] opacity-40" />
      <div className="pointer-events-none absolute bottom-[-60px] right-0 w-[320px] h-[320px] rounded-full bg-[#3B82F6] blur-[130px] opacity-20" />

      {/* Subtle grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/></filter><rect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/></svg>")',
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img
            src="/logo-banner.png"
            alt="Nailuxe"
            className="h-36 w-auto object-contain drop-shadow-[0_0_45px_rgba(156,106,222,0.45)]"
          />
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-1">Welcome back</h1>
        <p className="text-[#C4B5E8] text-sm text-center mb-5">Sign in to Nailuxe Studio</p>

        {/* Saved credentials banner if detected */}
        {savedEmailDetected && (
          <div className="mb-4 p-3 rounded-2xl bg-[#6750A4]/25 border border-[#9C6ADE]/40 backdrop-blur-md flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <CheckCircle2 size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wide">Saved Account Ready</p>
                <p className="text-xs font-bold text-white truncate">{savedEmailDetected}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearSaved}
              className="text-[11px] text-[#C4B5E8] hover:text-red-300 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} autoComplete="on" className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-bold text-[#C4B5E8] uppercase tracking-wide">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79747E]" />
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username email"
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/95 border border-white/10 text-sm text-[#1D1A22] placeholder-[#938F99] focus:outline-none focus:ring-2 focus:ring-[#9C6ADE] focus:border-transparent transition-all shadow-lg shadow-black/20"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-xs text-red-300 font-medium">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-bold text-[#C4B5E8] uppercase tracking-wide">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79747E]" />
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/95 border border-white/10 text-sm text-[#1D1A22] placeholder-[#938F99] focus:outline-none focus:ring-2 focus:ring-[#9C6ADE] focus:border-transparent transition-all shadow-lg shadow-black/20"
                {...register('password')}
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Hide password" : "Show password"}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#79747E] hover:text-[#1D1A22] transition-colors">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-300 font-medium">{errors.password.message}</p>}
          </div>

          {/* Remember Credentials Options */}
          <div className="space-y-2 py-2 px-1 bg-white/[0.04] rounded-xl border border-white/5 p-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-[#C4B5E8]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded-md accent-[#9C6ADE] cursor-pointer"
              />
              <span className="font-semibold text-white">Save Username & Password</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-[#C4B5E8]">
              <input
                type="checkbox"
                checked={autoLogin}
                onChange={e => setAutoLogin(e.target.checked)}
                className="w-4 h-4 rounded-md accent-[#9C6ADE] cursor-pointer"
              />
              <span className="text-white/80">Auto-login automatically when app opens</span>
            </label>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-400/30 rounded-xl text-xs text-red-200 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#6750A4] to-[#9C6ADE] text-white text-sm font-bold rounded-full hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-[#6750A4]/40 flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-98"
          >
            {loading && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          {/* Biometric Unlock Option */}
          {canBiometric && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={loading}
              className="w-full py-3 bg-white/10 hover:bg-white/15 border border-[#9C6ADE]/40 text-[#EADDFF] text-sm font-bold rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 shadow-sm"
            >
              <Fingerprint size={18} className="text-[#D0BCFF]" />
              <span>Unlock with Fingerprint / Face ID</span>
            </button>
          )}
        </form>

        <p className="text-center text-[#8A7FA8] text-xs mt-8">© 2026 Nailuxe Studio Manager</p>
      </div>
    </div>
  )
}
