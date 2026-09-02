import { useState } from 'react'
import { useAuth } from './AuthProvider'
import { APP_NAME, AUTH_GOOGLE, AUTH_PASSWORD, PROJECT_URL } from '../lib/config'

/**
 * Sign-in surface. Which methods appear is deploy-time config
 * (`VITE_AUTH_PROVIDERS`) — see docs/configuration.md.
 *
 * Whatever the method, the server-side allowlist trigger is the real gate: an
 * account not in `public.allowed_emails` cannot be created at all.
 */
export function SignIn() {
  return (
    <div className="grid min-h-full place-items-center px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <img src="/favicon.svg" alt="" className="mx-auto h-14 w-14 rounded-2xl" />
        <h1 className="font-display mt-5 text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">
          Your ventures, tasks and money — one place.
        </p>

        {AUTH_GOOGLE && <GoogleButton />}
        {AUTH_GOOGLE && AUTH_PASSWORD && <Divider />}
        {AUTH_PASSWORD && <PasswordForm />}

        <p className="mt-6 text-[13px] text-ink-faint">
          Private by design — only allowlisted accounts can sign in.
        </p>
      </div>
    </div>
  )
}

function GoogleButton() {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(friendlyAuthError(err))
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={go}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-field border border-line-strong bg-surface px-4 py-2.5 text-[15px] font-medium transition-colors hover:bg-sunken"
      >
        <GoogleMark />
        Continue with Google
      </button>
      <p className="mt-2 text-[12.5px] text-ink-faint">Recommended — stays signed in.</p>
      {error && <p className="mt-2 text-[13px] text-neg">{error}</p>}
    </div>
  )
}

function Divider() {
  return (
    <div className="mt-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[12px] uppercase tracking-wide text-ink-faint">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

function PasswordForm() {
  const { signInWithPassword, signUpWithPassword } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') await signInWithPassword(email, password)
      else await signUpWithPassword(email, password)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-field border border-line bg-surface px-3 py-2 text-[14.5px] placeholder:text-ink-faint focus:border-tide focus:outline-none'

  return (
    <form onSubmit={submit} className={`flex flex-col gap-2.5 ${AUTH_GOOGLE ? 'mt-6' : 'mt-8'}`}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
        className={field}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        required
        minLength={8}
        className={field}
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-field bg-tide px-4 py-2.5 text-[15px] font-medium text-tide-ink transition-opacity disabled:opacity-50"
      >
        {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in')
          setError(null)
        }}
        className="text-[13px] text-ink-faint underline decoration-dotted underline-offset-4 hover:text-ink-muted"
      >
        {mode === 'in' ? 'First time? Create your account' : 'Already set up? Sign in'}
      </button>
      {error && <p className="text-left text-[13px] text-neg">{error}</p>}
    </form>
  )
}

/**
 * Turn Supabase auth failures into something a person can act on.
 *
 * The allowlist trigger raises a Postgres exception, which GoTrue returns as
 * `{"code":"P0001","message":"This app is private..."}` with HTTP 500.
 * supabase-js does not recognise that body shape, so by the time we see it the
 * real text is gone — the error arrives as an `AuthRetryableFetchError` whose
 * message is the literal string "{}". Status is all we have left to key off,
 * hence the hedge in the wording rather than a flat claim.
 */
function friendlyAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: number } | null)?.status
  const m = msg.toLowerCase()

  if (m.includes('allowlist')) {
    return `That address isn’t on the allowlist. Add it to the allowed_emails table in your database — see the setup guide at ${PROJECT_URL}.`
  }
  if (status === 500 || m === '{}') {
    return `The database rejected this sign-up. Most likely this address isn’t in the allowed_emails table — see the setup guide at ${PROJECT_URL}.`
  }
  if (m.includes('already registered')) {
    return 'That account already exists — switch to "Sign in" instead.'
  }
  if (m.includes('invalid login credentials')) {
    return 'Wrong email or password. If you haven’t created the account yet, use "Create your account".'
  }
  if (m.includes('email not confirmed')) {
    return 'Check your inbox and confirm the address first, or turn off email confirmation in Supabase → Authentication → Sign In / Providers.'
  }
  return msg
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  )
}
