# Google Calendar (optional)

Links tasks to real calendar events and shows a day agenda inside the app.
Rescheduling in SuperCove moves the event; deleting the task removes it.

**Skip this entirely if you don't want it.** Everything else works without it,
including the Calendar page's time logger.

Note that Google *sign-in* and Google *Calendar* are separate. You can sign in
with Google without granting calendar access; the calendar scope is only
requested when `VITE_GOOGLE_CALENDAR=true`.

## 1. Create an OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen** → External. Add your own address under *Test users*.
   Staying in Testing mode is fine for personal use; refresh tokens expire after
   7 days in that mode, so publish the app if you get tired of re-authorising.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorised redirect URI:

   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

   Keep the client ID and client secret.

## 2. Tell Supabase

**Authentication → Providers → Google**: enable it, paste the client ID and
secret.

## 3. Give the edge function the secret

The browser must never see the client secret, so the token exchange happens in
an edge function:

```bash
npx supabase secrets set \
  GOOGLE_CLIENT_ID=your-client-id \
  GOOGLE_CLIENT_SECRET=your-client-secret

npx supabase functions deploy google-token
```

## 4. Turn it on

In `.env.local` (and your host's env vars):

```
VITE_AUTH_PROVIDERS=google,password
VITE_GOOGLE_CALENDAR=true
```

Rebuild, then **sign out and sign in again with Google**. That last part
matters: Google only issues the long-lived refresh token at sign-in, and the
app can't mint access tokens without it.

## How it works

Supabase hands the client a provider access token that expires in about an hour
and is never refreshed. So at sign-in the refresh token is stored in
`google_tokens`, and the `google-token` edge function exchanges it for fresh
access tokens on demand — with the client secret staying server-side. Tokens are
cached in memory and retried once on a 401.

The task↔event link is a `gcal_event_id` column on `todos`.

## Troubleshooting

**"Google Calendar is not connected."**
No refresh token stored. Sign out, sign in with Google again.

**Calendar works for an hour, then stops.**
The function secrets aren't set, so it's falling back to the sign-in-time token.
Redo step 3.

**`redirect_uri_mismatch`**
The URI in Google Cloud must be the Supabase callback exactly — your app's own
domain won't work.

**Stops working every 7 days.**
Your consent screen is in Testing mode. Publish it.

## Why not just embed a calendar iframe?

Tried it; it doesn't work. Browsers partition third-party cookies, which breaks
the embed for private calendars. The custom API agenda is the workaround, not a
preference.
