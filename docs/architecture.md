# Architecture

Orientation for anyone changing the code. Assumes you've run it once.

## Stack

Vite 8 · React 19 · TypeScript · Tailwind v4 · React Router · TanStack Query ·
Supabase · vite-plugin-pwa. About 11k lines.

## Shape

```
src/
  app/        shell, sidebar, bottom nav, load screen
  auth/       AuthProvider + sign-in
  components/ shared UI primitives, charts, editors
  features/   self-contained feature slices (todos, finance, notes, …)
  lib/        data layer, config, module registry, formatting, integrations
  pages/      one file per route
supabase/
  migrations/ schema
  functions/  edge functions (optional integrations)
```

`features/` holds things used by more than one page or too big to sit inline;
`pages/` are route entry points. Not a hard boundary, just where things ended up.

## Data layer

`src/lib/data.ts` is small on purpose. Generic hooks — `useRows`, `useInsert`,
`useUpdate`, `useDelete` — keyed by table name, fetching whole tables.

That works because this is a single-user app with low row counts: a few thousand
rows total. It would be wrong at scale, and that's a deliberate trade — no
pagination, no partial cache invalidation, no per-query types to maintain.

Two things there are load-bearing:

**`registerMutationDefaults`.** Mutations are registered as *keyed defaults*
(`['insert', table]`), not inline functions. The query cache is persisted to
localStorage, and functions can't be serialised — so a write made offline is
stored as a paused mutation and resumed on reload. An inline `mutationFn` breaks
that silently: the mutation persists with no function to run, and the write is
lost. Never add one to these hooks.

**The `TOUCHES` map.** Some writes fire database triggers that modify *other*
tables — logging an inventory sale decrements stock and creates a payment row.
React Query doesn't know that, so `TOUCHES` lists the extra tables to invalidate.
Add a trigger, add an entry, or the UI shows stale data.

## Auth and privacy model

Google OAuth and/or email+password, chosen with `VITE_AUTH_PROVIDERS`.

The real gate is a **database trigger on `auth.users`**: an address not in
`public.allowed_emails` cannot create an account at all. Client-side checks
would be trivially bypassed by calling the API directly; this isn't.

Every table is RLS'd on `owner_id = auth.uid()`. Two details that bite:

- Recent Supabase does **not** auto-grant table privileges. RLS is the gate, but
  without `grant ... to authenticated` PostgREST returns 403 anyway.
- `allowed_emails` and `reminder_log` are explicitly `revoke`d from `anon` and
  `authenticated`. Writing no `GRANT` is not enough: Supabase's default
  privileges on `public` hand every new table `TRUNCATE`, and **`TRUNCATE`
  bypasses RLS** — so the allowlist could otherwise be emptied by any token
  holder.

Signing out clears the persisted cache (`sc-cache`). It holds every note,
contact and figure as plaintext JSON, so leaving it behind would make "sign out"
meaningless on a shared machine.

## Modules

`src/lib/modules.ts` is the registry — id, label, icon, nav placement, owned
tables. Nav (`src/app/nav.ts`), routing (`src/App.tsx`), global search scoping
and the Settings toggles all derive from it. Adding a module is one entry plus a
lazy route.

`src/lib/useModules.ts` holds the on/off state in localStorage via
`useSyncExternalStore`. It's an external store rather than context because it
must be readable synchronously during render — routes and nav are built from it.
`getSnapshot` returns a cached Set; recomputing per call would loop forever.

Disabling a module unregisters its route, so its chunk is never fetched and,
with nothing mounted, its tables are never queried. **Backups deliberately
ignore this** and export every table — a disabled module must never mean a
lossy backup.

## Offline

The query cache persists to localStorage (`sc-cache`, 7 days). Reads work
offline from cache; writes queue as paused mutations and resume on reconnect.
Google Calendar state is excluded from persistence — it's token-derived and
stale copies are worse than none.

## PWA

`strategies: 'injectManifest'` with a hand-written `src/sw.ts`. Not `generateSW`:
workbox's bundler breaks when the project's absolute path contains an apostrophe
or other shell-special character.

## Styling

Tailwind v4 with `@theme inline` tokens in `src/index.css`. Colours are CSS
custom properties, and utilities map to them, so light/dark swap without any
class changes.

Typography: Bricolage Grotesque for display, Geist for UI, IBM Plex Mono
**reserved for actual code** (the notes editor). Figures use `.tnum` — tabular
numerals in the *sans* face. Mono on a label containing words is wrong here.

Chart colours are dedicated `--mx-*` variables, validated for colour-vision
deficiency in both themes. Don't reuse `--tide`/`--sunrise` in charts: they
change hue between themes, which breaks the series mapping.

## Charts

Recharts for bar and radar (`src/components/rcharts.tsx`). It needs `react-is`
as an explicit dependency — npm won't hoist it for Recharts, and it fails at
runtime without it. Donut and heatmap are hand-rolled SVG in
`src/components/charts.tsx` to avoid pulling in more library weight.

The Stats radar treats Important and Urgent as **overlapping** dimensions: a
task that's both counts toward each axis. They are not exclusive buckets.

## Optional integrations

**Google Calendar.** Supabase issues a provider access token that expires in
about an hour and never refreshes. So the refresh token is banked in
`google_tokens` at sign-in and the `google-token` edge function exchanges it,
keeping the client secret server-side. Tokens are cached in memory, retried once
on 401. The task↔event link is `todos.gcal_event_id`. The old iframe embed was
removed and shouldn't come back — third-party cookie partitioning breaks it for
private calendars.

**Push reminders.** `send-reminders` edge function, idempotent via
`reminder_log`, scheduled by pg_cron. Scheduling is a manual step because it
needs your own project's function URL.

## Conventions

- Additive schema changes only, in new migration files.
- Don't introduce abstractions a module doesn't need yet.
- Row actions use `sm:opacity-0 sm:group-hover:opacity-100` — visible by
  default, hover-reveal from `sm` up. Bare `opacity-0 group-hover:` makes them
  permanently invisible on touch devices.
- Long text uses `TaskText`, which truncates with a click-to-expand chevron only
  when it actually overflows.
- Horizontal scroll strips use `useDragScroll` + `.no-scrollbar`.
- There is no test runner. `npm run build` (type check) and `npm run lint` are
  the safety net.
