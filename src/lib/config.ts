/**
 * Deploy-time configuration.
 *
 * Everything a self-hoster might want to change without touching component code
 * lives here, read once from Vite's `import.meta.env`. Nothing user-specific
 * should ever be a literal anywhere else in the app.
 *
 * All values are optional — the defaults below are a working app. See
 * `.env.example` for the full list and `docs/configuration.md` for what each does.
 */

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v !== 'string' || v.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())
}

const env = import.meta.env

export const APP_NAME = str(env.VITE_APP_NAME, 'SuperCove')
export const APP_TAGLINE = str(env.VITE_APP_TAGLINE, 'Personal ops')

/** Filename-safe app name, for downloaded backups/exports. */
export const APP_SLUG =
  APP_NAME.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'app'

/** ISO 4217 code, e.g. USD, EUR, INR, GBP, JPY. */
export const CURRENCY = str(env.VITE_CURRENCY, 'USD')

/**
 * BCP 47 tag driving number and date formatting. Defaults to the browser's
 * locale so an unconfigured install still formats sensibly for whoever opens it.
 */
export const LOCALE = str(
  env.VITE_LOCALE,
  typeof navigator !== 'undefined' ? navigator.language : 'en-US',
)

/**
 * Which sign-in methods the sign-in screen offers, e.g. "google,password".
 *
 * Google is the smoother daily experience (no password re-entry, and it is the
 * same account the Calendar integration uses), but it requires an OAuth client,
 * so password is the default an unconfigured install falls back to. Listing
 * neither would lock everyone out, so we repair that to password.
 */
const providers = str(env.VITE_AUTH_PROVIDERS, 'password')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean)

export const AUTH_GOOGLE = providers.includes('google')
export const AUTH_PASSWORD = providers.includes('password') || !AUTH_GOOGLE

/**
 * Google Calendar is opt-in and independent of Google *sign-in*: signing in with
 * Google does not imply handing over calendar access. Only when this is on do we
 * request the calendar scope or store a refresh token.
 */
export const GOOGLE_CALENDAR = bool(env.VITE_GOOGLE_CALENDAR) && AUTH_GOOGLE

/** Web-push public key. Absent = the reminders feature is hidden entirely. */
export const VAPID_PUBLIC_KEY = str(env.VITE_VAPID_PUBLIC_KEY, '')
export const PUSH_ENABLED = VAPID_PUBLIC_KEY !== ''

/** Links shown in the sign-in footer and Settings. Blank = hidden. */
export const PROJECT_URL = str(
  env.VITE_PROJECT_URL,
  'https://github.com/volvotkar/supercove',
)
