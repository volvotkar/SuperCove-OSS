# Setup

Getting SuperCove running on your own machine and your own database. Budget
about 15 minutes for the hosted path, 5 for local.

You need [Node](https://nodejs.org) 20+ and a free
[Supabase](https://supabase.com) account. For local development you also need
Docker Desktop.

---

## 1. Get the code

```bash
git clone https://github.com/volvotkar/supercove.git
cd supercove
npm install
```

---

## 2. Create a database

### Option A — hosted Supabase (what you want for real use)

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
   Save the database password somewhere safe; you'll need it once.
2. Link the CLI and push the schema:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   Your project ref is in the dashboard URL:
   `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`.

### Option B — local Supabase (for trying it out or developing)

Start Docker Desktop, then:

```bash
npx supabase start
npx supabase db reset
```

`supabase start` prints an API URL and an `anon key` — you'll need both in step 4.

> `npx supabase db reset` **drops and recreates the database.** It is the right
> command on a fresh local instance and the wrong one anywhere near real data.

---

## 3. Add yourself to the allowlist

**This is the step people miss.** SuperCove is private by design: account
creation is blocked by a database trigger unless the address is on the
allowlist, and the allowlist ships empty. Until you do this, every sign-in
attempt fails.

In the Supabase dashboard go to **SQL Editor** and run:

```sql
insert into public.allowed_emails (email) values ('you@example.com');
```

Locally, the same thing:

```bash
npx supabase db execute --local \
  "insert into public.allowed_emails (email) values ('you@example.com');"
```

Use the exact address you'll sign in with. Add more rows if you want to allow
a second address (a work account, a partner). To lock things down again later,
delete the row — existing sessions survive, but no new account can be created.

---

## 4. Configure the app

```bash
cp .env.example .env.local
```

Fill in the two required values:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Hosted: **Settings → API** in the dashboard. Local: the output of
`npx supabase start` (or `cp .env.local.example .env.local`, which already has
the standard local values).

The anon/publishable key is *meant* to be public — row-level security is what
protects your data, not key secrecy. Never put the **service role** key here.

While you're in the file, set `VITE_CURRENCY` and `VITE_APP_NAME` to taste.
Everything else is optional — see [configuration.md](configuration.md).

---

## 5. Run it

```bash
npm run dev
```

Open http://localhost:5173, create your account with the email you allowlisted,
and you're in.

---

## Optional extras

Both are genuinely optional — the app is fully usable without either.

- **[Google Calendar](google-calendar.md)** — two-way task/event linking and a
  day agenda.
- **[Push reminders](push-notifications.md)** — one morning notification for
  payment follow-ups and upcoming key dates.

When you're ready to put it on the internet, see **[deploy.md](deploy.md)**.

---

## Troubleshooting

**"This app is private. Your account is not on the allowlist."**
Step 3 didn't happen, or the address doesn't match exactly. Check with:
`select * from public.allowed_emails;`

**"Database error saving new user"**
The same thing wearing a disguise — that's how Supabase surfaces the allowlist
trigger's rejection during sign-up.

**Requests return 403 but the policies look right**
A table is missing its `grant ... to authenticated`. Recent Supabase versions
don't add these automatically. RLS is the real gate; the grant just lets the
role reach the table at all. Every table in the initial migration has one — a
new table you add needs its own.

**`supabase start` fails**
Docker Desktop isn't running, or ports 54321/54322 are in use.
`npx supabase stop --no-backup` clears a wedged stack.

**Blank page after deploying**
Your host isn't rewriting unknown paths to `index.html`. This is a single-page
app, so it needs that. `vercel.json` handles Vercel; see
[deploy.md](deploy.md) for other hosts.
