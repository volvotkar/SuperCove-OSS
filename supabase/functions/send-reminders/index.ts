// Daily reminder sender: follow-ups due + key dates near, per user, at most
// once per day (reminder_log guards re-runs, so the public URL is idempotent).
//
// Scheduling is up to you — see docs/push-notifications.md for the pg_cron
// snippet. Pick a UTC hour that corresponds to morning in REMINDER_TZ.
//
// Required secrets:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Optional secrets:  REMINDER_TZ (IANA zone, default UTC)
//                    REMINDER_LOCALE, REMINDER_CURRENCY, APP_NAME

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// No default: a wrong or absent subject makes push providers reject the send,
// and silently mailing someone else's address would be worse than failing loudly.
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')
if (!VAPID_SUBJECT) {
  throw new Error(
    'VAPID_SUBJECT is not set. Use "mailto:you@example.com" — see docs/push-notifications.md.',
  )
}

webpush.setVapidDetails(
  VAPID_SUBJECT,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const TZ = Deno.env.get('REMINDER_TZ') ?? 'UTC'
const LOCALE = Deno.env.get('REMINDER_LOCALE') ?? 'en-US'
const CURRENCY = Deno.env.get('REMINDER_CURRENCY') ?? 'USD'
const APP_NAME = Deno.env.get('APP_NAME') ?? 'SuperCove'

/**
 * Today in the user's zone, not the server's. `en-CA` is used purely because it
 * formats as YYYY-MM-DD, which is what the date columns compare against.
 */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const moneyFmt = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
})

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000)
}

Deno.serve(async () => {
  const day = today()

  const { data: subs, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint, owner_id, subscription')
  if (subsErr) return Response.json({ error: subsErr.message }, { status: 500 })
  if (!subs || subs.length === 0) return Response.json({ sent: 0, reason: 'no subscriptions' })

  const owners = [...new Set(subs.map((s) => s.owner_id))]
  let sent = 0

  for (const owner of owners) {
    // Once per day per user.
    const { error: logErr } = await supabase
      .from('reminder_log')
      .insert({ owner_id: owner, sent_on: day })
    if (logErr) continue // already sent today (or race) — skip

    const [{ data: followUps }, { data: keyDates }] = await Promise.all([
      supabase
        .from('payments')
        .select('counterparty, amount, follow_up_on')
        .eq('owner_id', owner)
        .eq('status', 'awaited')
        .lte('follow_up_on', day),
      supabase
        .from('key_dates')
        .select('title, on_date')
        .eq('owner_id', owner)
        .gte('on_date', day),
    ])

    const lines: string[] = []
    for (const p of followUps ?? []) {
      const overdue = daysBetween(p.follow_up_on, day)
      lines.push(
        `Follow up: ${p.counterparty} — ${moneyFmt.format(Number(p.amount))}${
          overdue > 0 ? ` (${overdue}d overdue)` : ''
        }`,
      )
    }
    for (const k of keyDates ?? []) {
      const days = daysBetween(day, k.on_date)
      if (days <= 3) lines.push(days === 0 ? `Today: ${k.title}` : `${days}d to ${k.title}`)
    }
    if (lines.length === 0) continue

    const payload = JSON.stringify({
      title: `${APP_NAME} — today’s nudges`,
      body: lines.slice(0, 5).join('\n'),
    })

    for (const s of subs.filter((x) => x.owner_id === owner)) {
      try {
        await webpush.sendNotification(s.subscription, payload)
        sent += 1
      } catch (err) {
        // 404/410 = subscription expired — clean it up.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }
  }

  return Response.json({ sent })
})
