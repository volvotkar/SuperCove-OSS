import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { GOOGLE_CALENDAR } from '../lib/config'

type AuthState = {
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Google hands out the long-lived refresh token only at sign-in; bank it
      // so the google-token edge function can mint fresh access tokens later.
      // Only when Calendar is actually enabled — signing in with Google must not
      // imply storing calendar credentials.
      if (GOOGLE_CALENDAR && s?.provider_refresh_token) {
        void supabase
          .from('google_tokens')
          .upsert({ refresh_token: s.provider_refresh_token }, { onConflict: 'owner_id' })
          .then(({ error }) => {
            if (error) console.error('Could not store Google refresh token:', error.message)
          })
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // The calendar scope is requested only when the integration is on, so a
        // plain sign-in doesn't ask people for calendar access they never wanted.
        ...(GOOGLE_CALENDAR
          ? {
              scopes: 'https://www.googleapis.com/auth/calendar.events',
              queryParams: { access_type: 'offline', prompt: 'consent' },
            }
          : {}),
      },
    })
    if (error) throw error
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUpWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    // With email confirmation off (the self-host default) sign-up already
    // returns a session; with it on, the user must confirm before this works.
    await supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await supabase.auth.signOut()
    // The offline cache holds every note, contact and figure as plaintext JSON
    // for 7 days. Signing out has to take it with you — otherwise "sign out"
    // leaves the whole dataset readable in devtools on a shared machine.
    try {
      localStorage.removeItem('sc-cache')
    } catch {
      // Private-mode storage can throw; sign-out itself already succeeded.
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        signInWithGoogle,
        signInWithPassword,
        signUpWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
