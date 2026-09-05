import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Staff } from '../types/database'

interface AuthContextType {
  user: User | null
  session: Session | null
  staff: Staff | null
  actualStaff: Staff | null
  isImpersonating: boolean
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshStaff: () => Promise<void>
  loginAsStaff: (targetStaff: Staff) => void
  exitStaffView: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [actualStaff, setActualStaff] = useState<Staff | null>(() => {
    try {
      const saved = localStorage.getItem('nailuxe_cached_staff')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [impersonatedStaff, setImpersonatedStaff] = useState<Staff | null>(() => {
    try {
      const saved = localStorage.getItem('nailuxe_impersonated_staff')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  const staff = impersonatedStaff || actualStaff
  const isImpersonating = !!impersonatedStaff
  const isAdmin = actualStaff?.role === 'admin'

  async function fetchStaff(userId: string) {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error && data) {
      setActualStaff(data)
      try {
        localStorage.setItem('nailuxe_cached_staff', JSON.stringify(data))
      } catch {
        // ignore
      }
    }
  }

  async function refreshStaff() {
    if (user) await fetchStaff(user.id)
  }

  function loginAsStaff(targetStaff: Staff) {
    setImpersonatedStaff(targetStaff)
    localStorage.setItem('nailuxe_impersonated_staff', JSON.stringify(targetStaff))
  }

  function exitStaffView() {
    setImpersonatedStaff(null)
    localStorage.removeItem('nailuxe_impersonated_staff')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchStaff(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchStaff(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          setActualStaff(null)
          localStorage.removeItem('nailuxe_cached_staff')
          exitStaffView()
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    exitStaffView()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signOut() {
    exitStaffView()
    localStorage.removeItem('nailuxe_cached_staff')
    try {
      sessionStorage.setItem('nailuxe_manual_logout', 'true')
    } catch {
      // ignore
    }
    await supabase.auth.signOut()
    setActualStaff(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      staff,
      actualStaff,
      isImpersonating,
      loading,
      isAdmin,
      signIn,
      signOut,
      refreshStaff,
      loginAsStaff,
      exitStaffView,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
