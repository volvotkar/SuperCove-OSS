import { supabase } from './supabase'

/**
 * Google Calendar API (v3).
 *
 * Token strategy: Supabase only hands out a provider access token at sign-in
 * and never refreshes it (~1h lifetime). The long-lived refresh token is
 * captured into `google_tokens` (AuthProvider), and the `google-token` edge
 * function exchanges it server-side. We cache the fresh token in memory and
 * retry once on 401. In local dev (email sign-in) there is no Google account:
 * `getGoogleToken()` returns null and callers degrade loudly.
 */

let cached: { token: string; expiresAt: number } | null = null

async function refreshViaFunction(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<{
    access_token?: string
    expires_in?: number
    error?: string
  }>('google-token')
  if (error || !data?.access_token) return null
  cached = {
    token: data.access_token,
    // renew a few minutes early
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000,
  }
  return cached.token
}

export async function getGoogleToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token
  const refreshed = await refreshViaFunction()
  if (refreshed) return refreshed
  // Fallback: the sign-in-time token (fresh sessions, or secrets not set yet)
  const { data } = await supabase.auth.getSession()
  return data.session?.provider_token ?? null
}

/** Calendar API fetch with one automatic retry on an expired token. */
async function gcalFetch(path: string, init?: RequestInit): Promise<Response> {
  let token = await getGoogleToken()
  if (!token) throw new Error('Google Calendar is not connected.')
  let res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    token = await getGoogleToken(true)
    if (!token) throw new Error('Google session expired — sign in with Google again.')
    res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    })
  }
  return res
}

export type GcalEvent = {
  id: string
  summary?: string
  status: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location?: string
}

/** Events on the primary calendar between two instants, expanded and ordered. */
export async function listEvents(timeMinISO: string, timeMaxISO: string): Promise<GcalEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })
  const res = await gcalFetch(`/calendars/primary/events?${params}`)
  if (!res.ok) throw new Error(`Calendar API: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return ((json.items ?? []) as GcalEvent[]).filter((e) => e.status !== 'cancelled')
}

type EventInput = {
  summary: string
  startISO: string
  durationMins: number
}

export async function createCalendarEvent(input: EventInput): Promise<string | null> {
  const token = await getGoogleToken()
  if (!token) return null
  const start = new Date(input.startISO)
  const end = new Date(start.getTime() + input.durationMins * 60_000)
  const res = await gcalFetch('/calendars/primary/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    }),
  })
  if (!res.ok) throw new Error(`Calendar API: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.id as string
}

/**
 * Move/rename an existing event in place. Returns false when the event is gone
 * on the Google side (404/410) so the caller can fall back to creating one —
 * otherwise rescheduling would silently strand the task with a dead event id.
 */
export async function updateCalendarEvent(
  eventId: string,
  input: EventInput,
): Promise<boolean> {
  const token = await getGoogleToken()
  if (!token) return false
  const start = new Date(input.startISO)
  const end = new Date(start.getTime() + input.durationMins * 60_000)
  const res = await gcalFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    }),
  })
  if (res.status === 404 || res.status === 410) return false
  if (!res.ok) throw new Error(`Calendar API: ${res.status} ${await res.text()}`)
  return true
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getGoogleToken()
  if (!token) return
  const res = await gcalFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  })
  // 404/410 = already gone, which is the outcome we wanted anyway.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar API: ${res.status} ${await res.text()}`)
  }
}

/**
 * Best-effort removal of a task's linked event. Deliberately never throws: the
 * row deletion must go through even when Google is unreachable (offline, token
 * gone). Returns false when the event may still be sitting on the calendar, so
 * callers can say so rather than pretend it's clean.
 */
export async function unlinkTaskEvent(eventId: string | null): Promise<boolean> {
  if (!eventId) return true
  try {
    await deleteCalendarEvent(eventId)
    return true
  } catch {
    return false
  }
}
