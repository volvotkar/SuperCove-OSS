# AGENTS.md

Guidance for AI coding tools working in this repository. Human contributors
want [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/architecture.md](docs/architecture.md).

## What this is

SuperCove: a self-hosted, single-user personal-ops PWA. React 19 + Vite 8 +
TypeScript + Tailwind v4 + Supabase. ~11k lines.

**Hard boundary: no AI features inside the app.** It must never call a language
model at runtime. If a proposed feature needs one, it's out of scope no matter
how useful it sounds. (Using AI to edit this code is fine — that's you.)

## Commands

```bash
npm run dev              # dev server on :5173
npm run build            # tsc -b + vite build. This IS the type check.
npm run lint             # oxlint
npx supabase start       # local stack (needs Docker)
npx supabase db reset    # DROPS and recreates the local DB
```

There is **no test runner**. `npm run build` and `npm run lint` are the only
automated safety net, so never suppress a type error — fix it, or say you can't.

## Rules that will bite you

These are the non-obvious ones. Getting them wrong produces bugs that don't
surface until much later.

1. **Schema changes are additive only.** New tables, or new *nullable* columns,
   in a **new** migration file. Never edit `00000000000001_initial_schema.sql`
   — it's already applied on real installs. Never suggest `db reset` against a
   database with real data; it drops everything.

2. **Every new table needs `grant select, insert, update, delete ... to
   authenticated`.** Recent Supabase does not auto-grant. RLS is the real gate,
   but without the grant PostgREST returns 403 and the message won't say why.

3. **Every new table needs an RLS policy** on `owner_id = auth.uid()`, plus
   `alter table ... enable row level security`.

4. **Writing no GRANT is not the same as no privilege.** Supabase's default
   privileges on `public` hand every new table `TRUNCATE` to `anon` and
   `authenticated`, and TRUNCATE bypasses RLS. Sensitive tables need an explicit
   `revoke all ... from anon, authenticated` — see `allowed_emails`.

5. **Never add an inline `mutationFn` to the generic hooks** in
   `src/lib/data.ts`. Mutations are registered as keyed defaults so that offline
   writes persist as paused mutations; functions can't be serialised, so an
   inline one silently loses the write.

6. **A database trigger that writes to another table needs an entry in the
   `TOUCHES` map** in `src/lib/data.ts`, or the UI shows stale data after a
   mutation.

7. **Mono type is for code only.** IBM Plex Mono is reserved for the notes
   editor. Numbers use `.tnum` (tabular numerals in the sans face). Never put
   mono on a label containing words — this is a firm preference, not a nit.

8. **Row actions must stay visible on touch.** Use
   `sm:opacity-0 sm:group-hover:opacity-100`. Bare `opacity-0 group-hover:...`
   makes controls permanently unreachable on a phone.

9. **PWA: keep `injectManifest`.** Do not switch to `generateSW` — its bundler
   breaks when the project path contains an apostrophe.

10. **Don't reintroduce a Google Calendar iframe.** Third-party cookie
    partitioning breaks it for private calendars. The custom API agenda exists
    because the embed didn't work.

11. **Chart colours use the `--mx-*` variables.** Don't reuse `--tide` or
    `--sunrise` in charts — they change hue between light and dark, which
    scrambles the series mapping.

## Architecture in brief

- `src/lib/data.ts` — generic `useRows` / `useInsert` / `useUpdate` /
  `useDelete`, keyed by table name, whole-table fetches. Fine because this is
  single-user, low-volume; deliberately not built for scale.
- `src/lib/modules.ts` — the module registry. Nav, routes, search scoping and
  the Settings toggles all derive from it. Adding a module = one entry here plus
  a lazy route in `src/App.tsx`.
- `src/lib/useModules.ts` — enable/disable state in localStorage via
  `useSyncExternalStore`. `getSnapshot` must return a cached value; recomputing
  per call causes an infinite render loop.
- `src/lib/config.ts` — all deploy-time config. **Nothing user-specific should
  be a literal anywhere else.** New configurable thing → add it here.
- `src/lib/matrix.ts` — single source of quadrant enums, labels and colours.
- `src/lib/backup.ts` — exports **every** table regardless of module toggles.
  Keep it that way; a disabled module must never mean a lossy backup.

## Style

Match the surrounding code — comment density, naming, structure. Comments here
explain **why**, especially where the obvious approach was tried and failed.
Those comments are load-bearing; don't delete them while refactoring.

Don't add abstractions a module doesn't need yet. Don't add dependencies for
small jobs — there are hand-rolled SVG charts in `src/components/charts.tsx`
specifically to avoid more library weight.

## When adding a feature

1. Is it optional? Add it to `MODULES` in `src/lib/modules.ts` with a toggle.
2. Does it need a table? New migration, RLS policy, grant, and add the table to
   `TABLES` in `src/lib/data.ts`.
3. Does it need config? `src/lib/config.ts` + `.env.example` + `docs/configuration.md`.
4. Does it change setup? Update `docs/setup.md`.
5. `npm run lint && npm run build` before you claim it works.
