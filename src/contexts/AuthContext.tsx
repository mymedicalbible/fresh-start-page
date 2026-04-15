import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearSummaryArchive } from '../lib/summaryArchive'
import { clearTranscriptArchive } from '../lib/transcriptArchive'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider ({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const lastUserIdRef = useRef<string | null>(null)

  const clearLocalMedicalCaches = useCallback((userId?: string | null) => {
    if (typeof window === 'undefined') return
    clearTranscriptArchive(userId ?? undefined)
    clearSummaryArchive(userId ?? undefined)
    try {
      localStorage.removeItem('mb-handoff-focus')
      sessionStorage.removeItem('mb-pending-transcript-bundle')
    } catch {
      // best effort for local browser cache cleanup
    }
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        lastUserIdRef.current = data.session?.user?.id ?? null
        setSession(data.session ?? null)
      })
      .catch(() => {
        if (!mounted) return
        setSession(null)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      const prevUserId = lastUserIdRef.current
      const nextUserId = next?.user?.id ?? null
      if (prevUserId && prevUserId !== nextUserId) {
        clearLocalMedicalCaches(prevUserId)
      }
      lastUserIdRef.current = nextUserId
      setSession(next)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    clearLocalMedicalCaches(session?.user?.id)
    await supabase.auth.signOut()
  }, [clearLocalMedicalCaches, session?.user?.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth () {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
