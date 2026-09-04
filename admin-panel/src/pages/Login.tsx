import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'

const schema = z.object({
  email: z.string().min(1, 'Email required'),
  password: z.string().min(1, 'Password required'),
})
type FormData = z.infer<typeof schema>

export function Login() {
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setErrorMsg('')
    setLoading(true)

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email.trim(),
        password: data.password,
      })

      if (error) { setErrorMsg(error.message); return }
      if (!authData?.user) { setErrorMsg('Login failed'); return }

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
        <div className="flex justify-center mb-8">
          <img
            src="/logo-banner.png"
            alt="Nailuxe"
            className="h-40 w-auto object-contain drop-shadow-[0_0_45px_rgba(156,106,222,0.45)]"
          />
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-1">Welcome back</h1>
        <p className="text-[#C4B5E8] text-sm text-center mb-8">Sign in to your account</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#C4B5E8] uppercase tracking-wide">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79747E]" />
              <input
                type="text"
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/95 border border-white/10 text-sm text-[#1D1A22] placeholder-[#938F99] focus:outline-none focus:ring-2 focus:ring-[#9C6ADE] focus:border-transparent transition-all shadow-lg shadow-black/20"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-xs text-red-300 font-medium">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#C4B5E8] uppercase tracking-wide">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#79747E]" />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/95 border border-white/10 text-sm text-[#1D1A22] placeholder-[#938F99] focus:outline-none focus:ring-2 focus:ring-[#9C6ADE] focus:border-transparent transition-all shadow-lg shadow-black/20"
                {...register('password')}
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#79747E] hover:text-[#1D1A22] transition-colors">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-300 font-medium">{errors.password.message}</p>}
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
            className="w-full py-3 bg-gradient-to-r from-[#6750A4] to-[#9C6ADE] text-white text-sm font-bold rounded-full hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-[#6750A4]/40 flex items-center justify-center gap-2 mt-2"
          >
            {loading && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[#8A7FA8] text-xs mt-8">© 2026 Nailuxe Studio Manager</p>
      </div>
    </div>
  )
}
