# Deploying

SuperCove builds to static files. Any static host works — the only requirement
is that unknown paths rewrite to `index.html`, because it's a single-page app.
Without that, refreshing on `/todos` gives a 404.

## Recommended: your own subdomain

If you already own a domain, the nicest setup is a subdomain like
`app.yourdomain.com` or `supercove.yourdomain.com`. It's yours, it's memorable,
and it makes the PWA install cleanly.

### Vercel

1. Push your fork to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Framework preset
   Vite, build `npm run build`, output `dist`. It usually detects all of this.
3. **Settings → Environment Variables**: add everything from your `.env.local`.
   This is the step people forget — the build bakes them in, so a variable added
   later needs a redeploy.
4. **Settings → Domains** → add `supercove.yourdomain.com`, then add the CNAME
   record Vercel shows you at your DNS provider.

`vercel.json` in this repo already handles the SPA rewrite.

### Netlify

Same shape. Build `npm run build`, publish directory `dist`, env vars under
**Site settings → Environment variables**. Netlify needs its own rewrite rule —
create `public/_redirects` containing:

```
/*  /index.html  200
```

### Cloudflare Pages

Build `npm run build`, output `dist`. Set **Single Page Application** mode, or
add the same `_redirects` file.

## No domain? Netlify Drop

The fastest possible route, no account or git required:

```bash
npm run build
```

Then drag the `dist` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).
You get a URL like `random-name-123.netlify.app` immediately, and you can claim
it to a free account afterwards to keep it.

Add the `public/_redirects` file above *before* building, or deep links will
404. Note that you'll have to repeat this on every change — connecting a git
repo is worth it once you're past trying it out.

## After deploying

- **Check the env vars took.** If the app loads but can't reach Supabase, the
  variables aren't in the host's settings, or you added them after the last
  build.
- **Add the production URL to Supabase.** Authentication → URL Configuration →
  Site URL and Redirect URLs. OAuth sign-in fails without it.
- **Install it.** Chrome/Edge show an install icon in the address bar; on iOS
  use Share → Add to Home Screen. Push notifications on iOS *only* work from
  the installed app.
- **Take a backup.** Settings → Backup & export. Do this before you rely on it,
  not after.

## Keeping your fork updated

```bash
git remote add upstream https://github.com/volvotkar/SuperCove-OSS.git
git fetch upstream
git merge upstream/main
```

If the update adds migrations, run `npx supabase db push` afterwards. Schema
changes here are additive by policy, so this should not disturb your data — but
take a backup first anyway.
