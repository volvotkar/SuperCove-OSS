# Security

## Reporting a vulnerability

Please **don't** open a public issue.

Use GitHub's private reporting — **Security → Report a vulnerability** on the
repository — or email the address on the
[maintainer's GitHub profile](https://github.com/volvotkar).

Include what the issue is, how to reproduce it, and what an attacker could
achieve. You'll get an acknowledgement within a few days. This is a personal
project maintained in spare time, so please be patient with fix timelines — but
anything involving data exposure gets priority.

## Scope

This is self-hosted software: there's no service to attack, and every install is
someone's own Supabase project. Relevant issues are things like:

- A way to read or write another user's rows (an RLS or grant gap)
- A way to bypass the sign-up allowlist
- Secrets leaking into the client bundle
- XSS, particularly through note content or file uploads

Out of scope: vulnerabilities in Supabase itself (report those to Supabase), and
misconfigurations of your own instance.

## For people running SuperCove

A few things worth knowing:

- **The anon/publishable key is public by design.** It's in the JavaScript
  bundle and that's fine — row-level security is what protects your data. The
  **service role** key is not, and must never appear in a `VITE_` variable.
- **The allowlist is what makes your instance private.** It's enforced by a
  database trigger, not in the client. Keep it to addresses you control, and
  check it with `select * from public.allowed_emails;` after any schema work.
- **Signing out clears the local cache.** The offline cache holds your notes,
  contacts and figures as plaintext JSON in localStorage. Sign out on shared
  machines rather than just closing the tab.
- **Backups are only encrypted if you use the encrypted option.** The JSON and
  CSV exports are plaintext. The `.scb` archive is AES-256-GCM with a passphrase
  that cannot be recovered — if you lose it, the archive is gone.
- **New tables need explicit grants and an RLS policy.** If you add tables with
  an AI tool, verify both. `select * from pg_policies where schemaname='public';`
