# Changelog

Notable changes to SuperCove. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — unreleased

First public release. Extracted from a private personal build that had been in
daily use for several months, then generalised so anyone can run their own.

### Added
- **Module switches** (Settings → Modules). Turning a module off unregisters its
  route, so its code is never downloaded and its tables are never queried.
- **Route-level code splitting.** Initial load dropped from ~481 KB to ~152 KB
  gzipped; Recharts and CodeMirror now load only when their pages are opened.
- **Email + password sign-in**, selectable alongside or instead of Google via
  `VITE_AUTH_PROVIDERS`. The server-side allowlist still gates account creation.
- **Deploy-time configuration** (`src/lib/config.ts`): app name, tagline,
  currency, locale, auth providers, and feature flags for the optional
  integrations.
- Self-hosting documentation: setup, configuration, deployment, Google Calendar,
  push notifications, architecture, and a guide to modifying the app with AI
  tools.
- `AGENTS.md` for AI coding tools.

### Changed
- Currency and locale are configurable rather than fixed to INR / `en-IN`.
- Reminder timezone is configurable (`REMINDER_TZ`) rather than fixed to IST.
- Google Calendar is opt-in and independent of Google sign-in: the calendar
  scope is only requested when the integration is enabled, and no refresh token
  is stored otherwise.
- Push reminders hide themselves entirely when no VAPID key is configured.
- The twelve original migrations are flattened into a single initial schema.
- Default finance categories are generic and documented as editable.

### Fixed
- **Allowlist could be emptied by any authenticated user.** Supabase's default
  privileges on `public` grant `TRUNCATE` to `anon` and `authenticated`, and
  TRUNCATE bypasses RLS. `allowed_emails` and `reminder_log` are now explicitly
  revoked.
- Sign-up failures showed `{}` instead of a message. supabase-js cannot parse
  GoTrue's `{code, message}` error body, so the allowlist rejection arrived
  unreadable; the client now explains what to do.

### Security
- The `VAPID_SUBJECT` edge function secret is required rather than defaulting to
  a hardcoded address.
