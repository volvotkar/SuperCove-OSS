# Making it yours with AI tools

SuperCove is a personal-ops app, and "personal" is the point. The version you
run should fit *your* life, not the author's. This codebase is small (~11k lines),
conventionally structured, and documented for exactly this — pointing an AI
coding tool at it and reshaping it works well.

> To be clear: the app itself contains **no AI features** and never calls a model
> at runtime. This is about using AI to *edit the code*, not about what the app
> does.

## Setting up

Any of these work: [Claude Code](https://claude.com/claude-code), Cursor,
Windsurf, Copilot, Zed, Aider.

The repo ships an **`AGENTS.md`** at the root. Most tools read it automatically
(Claude Code also reads `CLAUDE.md`, which points at the same file). It carries
the conventions and the non-obvious traps, so the tool gets them right without
you re-explaining every session.

Start by asking for orientation rather than changes:

> Read AGENTS.md and docs/architecture.md, then explain how the todo list gets
> its data, from the database table to the rendered row.

## Good first changes

Ordered roughly by difficulty.

**Rewrite the copy.** The quotes in `src/pages/Dashboard.tsx` and the load-screen
lines in `src/app/LoadScreen.tsx` are plain arrays.

> Replace the QUOTES array in src/pages/Dashboard.tsx with quotes about
> gardening. Keep the same shape and roughly the same length.

**Recolour it.** Design tokens are CSS custom properties in `src/index.css`, and
Tailwind utilities map to them, so themes swap without touching class names.

> The accent colour is defined by --tide in src/index.css. Change the light
> theme to forest green and the dark theme to a lighter sage, keeping contrast
> against the background at WCAG AA or better.

**Add a field.** This one crosses every layer, so it's the best way to learn the
codebase:

> Add an optional "email" field to contacts. I need a migration, the type in
> src/lib/types.ts, the form in src/pages/Contacts.tsx, and it should be
> searchable in the global search. Schema changes must be additive.

**Add a module.** `src/lib/modules.ts` is the registry; nav, search scoping and
the Settings toggle all derive from it.

> Add a "Reading list" module: a table of books with title, author, status and
> rating. Follow the pattern in src/pages/Contacts.tsx, register it in
> src/lib/modules.ts, and add a lazy route in src/App.tsx.

**Remove what you don't want.** Try the Settings toggle first — it already stops
the code loading. Delete the module only if you're sure.

## Rules worth pasting into your tool

These are the ones where an AI will confidently do the wrong thing:

1. **Schema changes must be additive.** New tables, or new *nullable* columns,
   in a *new* migration file. Never edit an applied migration, and never run
   `supabase db reset` against a database holding real data — it drops everything.
2. **Every new table needs `grant ... to authenticated`.** RLS is the real gate,
   but without the grant PostgREST returns 403 and the error won't say why.
3. **Every new table needs an RLS policy on `owner_id = auth.uid()`.** Miss it
   and the table is either unreadable or, worse, readable by everyone.
4. **Don't put an inline `mutationFn` in the generic hooks** in `src/lib/data.ts`.
   Offline writes are persisted as paused mutations and functions can't be
   serialised — inline ones break offline support silently.
5. **If a database trigger writes to another table, add it to the `TOUCHES` map**
   in `src/lib/data.ts`, or the UI shows stale data after a mutation.
6. **Mono type is for code only.** IBM Plex Mono is reserved for the notes
   editor. Use `.tnum` (tabular numerals in the sans face) for figures. Never
   put mono on a label containing words.
7. **Row actions must stay visible on touch.** Use
   `sm:opacity-0 sm:group-hover:opacity-100`, never bare `opacity-0
   group-hover:opacity-100` — that makes controls permanently invisible on a
   phone.

## Working safely

- **Branch first.** `git checkout -b my-change`. Easy to throw away.
- **Back up before schema work.** Settings → Backup & export → Everything (JSON).
- **Develop against a local database**, not your real one:
  `npx supabase start && npx supabase db reset`.
- **Check it compiles**: `npm run build` and `npm run lint`. There's no test
  suite, so the type checker is your safety net — take its complaints seriously
  rather than asking the AI to cast them away.
- **Read the diff before committing.** `git diff`. If you don't understand a
  change, ask what it does and why before keeping it.

## When it goes wrong

AI tools fail in recognisable ways here:

- **Inventing Supabase APIs.** If a method looks unfamiliar, check the
  [docs](https://supabase.com/docs/reference/javascript).
- **Adding heavy dependencies for small jobs.** Ask whether the codebase already
  does it — there are hand-rolled SVG charts in `src/components/charts.tsx`
  precisely to avoid another library.
- **"Fixing" type errors by casting to `any`.** That hides the bug rather than
  solving it.
- **Silently widening scope.** Ask for one thing at a time and review between
  steps.

If you get badly stuck, `git checkout .` discards uncommitted changes and you
start again. Nothing you do to the frontend can hurt your data — only migrations
can, which is why they get their own rules above.
