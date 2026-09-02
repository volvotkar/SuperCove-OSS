# Push reminders (optional)

One notification in the morning listing payment follow-ups that are due and key
dates coming up in the next three days — and only on days there's something to
say. No notification on a quiet day.

**Skip this if you don't want it.** Leave `VITE_VAPID_PUBLIC_KEY` blank and the
whole feature, including its Settings card, stays hidden.

## 1. Generate a VAPID keypair

```bash
npx web-push generate-vapid-keys
```

You get a public key and a private key. The public one is safe in the browser
bundle. **The private one must never leave your edge function secrets.**

## 2. Set the function secrets

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY=your-public-key \
  VAPID_PRIVATE_KEY=your-private-key \
  VAPID_SUBJECT=mailto:you@example.com \
  REMINDER_TZ=Europe/London \
  REMINDER_LOCALE=en-GB \
  REMINDER_CURRENCY=GBP \
  APP_NAME=SuperCove
```

`VAPID_SUBJECT` is required — the function refuses to start without it, because
push providers reject sends with a missing or wrong subject. Use your own
`mailto:`.

`REMINDER_TZ` is an [IANA zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
and decides which calendar day "today" means. It defaults to UTC, which will be
wrong for most people. The other three only affect how the notification text is
formatted.

## 3. Deploy the function

```bash
npx supabase functions deploy send-reminders --no-verify-jwt
```

`--no-verify-jwt` is intentional: the scheduler calls it with no user session.
The function is safe to call repeatedly — `reminder_log` has a primary key on
`(owner_id, sent_on)`, so a second call on the same day inserts nothing and
sends nothing.

## 4. Schedule it

This step is **not** in the migrations, because it needs your project's own
function URL. In the Supabase dashboard's SQL editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-reminders',
  '30 6 * * *',            -- 06:30 UTC, every day
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

Replace `YOUR_PROJECT_REF`, and **pick a UTC hour that is morning where you
are** — cron runs on UTC, not on `REMINDER_TZ`. A few examples for an 08:00
local delivery:

| Your zone | UTC offset | Cron |
|---|---|---|
| `Europe/London` (BST) | +1 | `0 7 * * *` |
| `Asia/Kolkata` | +5:30 | `30 2 * * *` |
| `America/New_York` (EDT) | −4 | `0 12 * * *` |
| `Asia/Tokyo` | +9 | `0 23 * * *` |

Offsets shift with daylight saving; the notification will drift by an hour
twice a year unless you adjust the cron entry.

To check or remove it:

```sql
select * from cron.job;
select cron.unschedule('daily-reminders');
```

## 5. Turn it on

Add the public key to your env:

```
VITE_VAPID_PUBLIC_KEY=your-public-key
```

Rebuild, then open **Settings → Daily reminders → Enable on this device** and
accept the browser prompt. Opt-in is per device — each phone or laptop you want
notifications on needs its own.

Test without waiting for the schedule:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders
```

Remember it only sends when there's something to report, and only once per day
per user. To retest on the same day, clear the log first:

```sql
delete from public.reminder_log where sent_on = current_date;
```

## Troubleshooting

**Nothing arrives** — most often there was genuinely nothing to report. Add a
payment with a follow-up date of today and retry.

**"VAPID_SUBJECT is not set"** — step 2 was skipped or the secret name is
misspelled. `npx supabase secrets list` to check.

**Arrives at the wrong time** — the cron hour is UTC. See the table above.

**Stopped after reinstalling the app / clearing site data** — the browser issued
a new subscription. Re-enable it in Settings. Expired subscriptions are deleted
automatically when the push provider reports 404/410.

**iOS** — Safari only delivers web push to apps installed to the Home Screen.
Use Share → Add to Home Screen, then enable reminders from the installed app.
