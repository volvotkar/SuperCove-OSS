# Configuration

Every knob, in one place. Nothing here is required — the defaults are a working
app.

## Environment variables

Set these in `.env.local` for development, or in your host's environment
variable settings for production. All of them are compiled into the browser
bundle, so **none of them can hold a secret**.

| Variable | Default | What it does |
|---|---|---|
| `VITE_SUPABASE_URL` | — | **Required.** Your project's API URL. |
| `VITE_SUPABASE_ANON_KEY` | — | **Required.** The anon/publishable key. Public by design; RLS is what protects your data. |
| `VITE_APP_NAME` | `SuperCove` | Name in the sidebar, tab title, PWA manifest and backup filenames. |
| `VITE_APP_TAGLINE` | `Personal ops` | The line under the name in the sidebar. |
| `VITE_PROJECT_URL` | repo URL | Where the allowlist error sends people for help. |
| `VITE_CURRENCY` | `USD` | ISO 4217 code. Drives every amount and the symbol on input labels. |
| `VITE_LOCALE` | browser locale | BCP 47 tag for number and date formatting. |
| `VITE_AUTH_PROVIDERS` | `password` | `password`, `google`, or `google,password`. |
| `VITE_GOOGLE_CALENDAR` | `false` | Turns on the Calendar sync. Requires `google` in the providers list. |
| `VITE_VAPID_PUBLIC_KEY` | — | Public half of your VAPID keypair. Blank hides push reminders entirely. |

Renaming the app changes your backup filename prefix. Old backups still restore
fine — nothing reads the name back.

### Secrets that are *not* env vars

These live in Supabase edge function secrets
(`npx supabase secrets set NAME=value`) and must never appear in `.env.local`:

`GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`, and the Supabase **service role**
key. If any of them ends up in a `VITE_` variable it ships to every visitor.

## Modules

**Settings → Modules** switches features on and off. This isn't cosmetic: a
module that's off never has its route registered, so its JavaScript is never
downloaded and its tables are never queried.

Your data is untouched either way, and **backups always include every table**
regardless of what's switched on — turning a module back on brings its data
straight back.

The setting is stored per-device in `localStorage` (key `sc-modules`), so it
works offline and needs no migration. Reinstalling the PWA resets it to
defaults.

| Module | Gives you |
|---|---|
| Todos | Day / week / month lists, priorities, carry-over |
| Calendar | Day agenda and time logging |
| Notes | Markdown notes with attachments |
| Habits | Month-scoped habit grid and heatmap |
| Finance | Expenses, payments, follow-ups |
| Projects | Kanban, per-project notes, files, spend |
| Scrapbook | Free-form boards of images and text |
| Stats | Charts across time, tasks and money |
| Inventory | Products, stock and sales wired into finance |
| Contacts | Lightweight people lookup |
| Weekly Review | A weekly look back and plan forward |
| Key Dates · Streaks · Quick Capture | Dashboard widgets |

The dashboard and Settings can't be switched off.

## Making it yours

- **Quotes** — `src/pages/Dashboard.tsx`, the `QUOTES` array. One shows per day.
- **Load screen lines** — `src/app/LoadScreen.tsx`, the `QUIRKY` array.
- **Colours and type** — `src/index.css`. Design tokens are CSS custom
  properties, and Tailwind utilities map to them, so light and dark swap
  without touching a single class name.
- **Default finance categories** — the `handle_new_user` function in
  `supabase/migrations/00000000000001_init.sql`. Only applies to accounts
  created *after* you change it; categories are editable in-app anyway.
- **Adding a module** — add an entry to `MODULES` in `src/lib/modules.ts` and a
  lazy route in `src/App.tsx`. Nav, search scoping and the Settings toggle all
  follow automatically.

See [customizing-with-ai.md](customizing-with-ai.md) for doing this with an AI
coding tool.
