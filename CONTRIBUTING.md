# Contributing

Thanks for looking. Issues, bug reports and pull requests are all welcome.

## Before you build something big

SuperCove is opinionated, and a few things are settled rather than open:

- **Single-user per install.** Not a team tool. Multi-user, sharing and
  permissions are out of scope.
- **No global AI features in the app.** It never calls a language model at runtime.
  This isn't up for debate. If you do wish to incorporate AI features, please fork this repository and edit in your features.
- **Features stay optional.** New modules go in the registry with a toggle, so
  people who don't want them pay nothing for them.
- **Schema changes are additive.** People run this on real data.

If your idea conflicts with those, fork it — genuinely, that's a good outcome
and the licence exists to make it easy. For anything sizeable that *doesn't*
conflict, open an issue first so you don't spend a weekend on something that
gets declined.

## Getting set up

```bash
git clone https://github.com/YOUR_USERNAME/SuperCove-OSS.git
cd SuperCove-OSS
npm install
cp .env.local.example .env.local
npx supabase start
npx supabase db reset
npm run dev
```

Add yourself to the allowlist before signing up — see [docs/setup.md](docs/setup.md).

## Before you open a PR

```bash
npm run lint
npm run build      # this is also the type check
```

There's no test suite yet. The type checker and manual testing are what we have,
so please actually run the thing and click through what you changed. If you want
to add a test runner, that's a welcome PR on its own.

## Conventions

[docs/architecture.md](docs/architecture.md) has the full picture. The ones that
catch people:

- New table → RLS policy on `owner_id = auth.uid()` **and** an explicit
  `grant ... to authenticated`. Without the grant you get a 403 that doesn't
  explain itself.
- Never add an inline `mutationFn` to the generic hooks in `src/lib/data.ts` —
  it silently breaks offline writes.
- New trigger that writes to another table → add it to the `TOUCHES` map.
- Row actions: `sm:opacity-0 sm:group-hover:opacity-100`, never bare
  `opacity-0 group-hover:` (invisible forever on touch).
- Mono type is for code only. Figures use `.tnum`.

Match the surrounding style rather than introducing a new one. Comments should
explain *why*, especially where the obvious approach was tried and failed —
there are several of those in here and they're the most valuable lines in the
codebase.

## Reporting bugs

Include what you expected, what happened, your browser and OS, whether it's
local or hosted Supabase, and anything in the browser console. A screenshot
helps for anything visual.

## Security

Don't open a public issue for a security problem — see [SECURITY.md](SECURITY.md).
