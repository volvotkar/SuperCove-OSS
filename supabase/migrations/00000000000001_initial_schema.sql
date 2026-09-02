-- ===========================================================================
-- Initial schema.
--
-- Single-user-per-instance by design: every table is row-level-secured on
-- `owner_id = auth.uid()`, and account creation is gated by an allowlist
-- enforced with a trigger on auth.users — not merely in the client.
--
-- Two things bite people setting this up; both are handled below and worth
-- knowing about before you edit this file:
--
--   1. `public.allowed_emails` ships EMPTY. Until you add your own address,
--      every sign-up is rejected. See docs/setup.md — this is one INSERT.
--
--   2. Recent Supabase does NOT auto-grant table privileges to the
--      `authenticated` role. RLS is the real gate, but without an explicit
--      `grant` PostgREST answers 403 anyway. Any new table needs one.
--
-- Schema changes after this point should be ADDITIVE (new tables, new nullable
-- columns) and go in a new migration file — never by editing this one, and
-- never with `db reset` against an instance holding real data.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Auth allowlist
-- ---------------------------------------------------------------------------
create table public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;
-- No policies, and no grants, on purpose: this table must be unreachable
-- through the API. Add addresses with the SQL editor or psql only.

-- >>> SETUP STEP <<<
-- Add yourself, or nobody can sign in:
--   insert into public.allowed_emails (email) values ('you@example.com');

create or replace function public.enforce_allowlist()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails a where lower(a.email) = lower(new.email)
  ) then
    raise exception 'This app is private. Your account is not on the allowlist.';
  end if;
  return new;
end;
$$;

create trigger enforce_allowlist_on_signup
  before insert on auth.users
  for each row execute function public.enforce_allowlist();


-- ---------------------------------------------------------------------------
-- Profiles + first-run seed data
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());


-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
create policy "own projects" on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index projects_owner_idx on public.projects (owner_id);


-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
alter table public.finance_categories enable row level security;
create policy "own categories" on public.finance_categories
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  category_id uuid references public.finance_categories (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  note text,
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
create policy "own expenses" on public.expenses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index expenses_owner_date_idx on public.expenses (owner_id, spent_on desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  counterparty text not null,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'awaited' check (status in ('awaited', 'completed')),
  follow_up_on date,
  received_on date,
  project_id uuid references public.projects (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create policy "own payments" on public.payments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index payments_owner_followup_idx on public.payments (owner_id, follow_up_on);

-- Seed a profile and a starter set of spending categories on first sign-in.
-- These are only defaults — categories are fully editable in the app, so
-- change this list to whatever suits you before your first sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.finance_categories (owner_id, name)
  values
    (new.id, 'Personal'),
    (new.id, 'Work'),
    (new.id, 'Food'),
    (new.id, 'Transport'),
    (new.id, 'Bills'),
    (new.id, 'Health');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- Todos: Day / Week / Month each hold multiple named lists; General Goals is
-- its own independent section. 'project' is reserved for project-level lists.
--
-- agenda_on pins a Day list to a calendar date. Membership alone is not enough:
-- without it, every future day list floods "today".
-- ---------------------------------------------------------------------------
create table public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null check (section in ('day', 'week', 'month', 'goals', 'project')),
  project_id uuid references public.projects (id) on delete cascade,
  name text not null,
  position int not null default 0,
  agenda_on date,
  created_at timestamptz not null default now(),
  check ((section = 'project') = (project_id is not null))
);
alter table public.todo_lists enable row level security;
create policy "own todo lists" on public.todo_lists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index todo_lists_owner_section_idx on public.todo_lists (owner_id, section, position);
create index todo_lists_agenda_idx on public.todo_lists (owner_id, agenda_on);

-- cancelled_at is distinct from `done` and from deletion: the row stays, struck
-- through and restorable, but leaves the agenda, calendar, review and stats.
--
-- carried_on is the day a leftover was last carried forward. Carry-over must
-- not rewrite created_at — doing so destroys the task's real age and skews
-- anything ordering by it.
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null references public.todo_lists (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  completed_at timestamptz,
  cancelled_at timestamptz,
  position int not null default 0,
  due_on date,
  carried_on date,
  priority text check (priority in ('do_now', 'schedule', 'delegate', 'skip')),
  -- Google Calendar link (task <-> event stay connected). Optional feature.
  gcal_event_id text,
  scheduled_at timestamptz,
  scheduled_duration_mins int,
  created_at timestamptz not null default now()
);
alter table public.todos enable row level security;
create policy "own todos" on public.todos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index todos_list_idx on public.todos (list_id, position);
create index todos_owner_due_idx on public.todos (owner_id, due_on);


-- ---------------------------------------------------------------------------
-- Contacts — lightweight lookup, not a CRM.
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  last_interaction_on date,
  created_at timestamptz not null default now()
);
alter table public.contacts enable row level security;
create policy "own contacts" on public.contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index contacts_owner_name_idx on public.contacts (owner_id, name);


-- ---------------------------------------------------------------------------
-- Kanban — default columns seeded per project by trigger.
-- ---------------------------------------------------------------------------
create table public.kanban_columns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.kanban_columns enable row level security;
create policy "own kanban columns" on public.kanban_columns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index kanban_columns_project_idx on public.kanban_columns (project_id, position);

create table public.kanban_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  column_id uuid not null references public.kanban_columns (id) on delete cascade,
  title text not null,
  note text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.kanban_cards enable row level security;
create policy "own kanban cards" on public.kanban_cards
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index kanban_cards_column_idx on public.kanban_cards (column_id, position);

create or replace function public.seed_kanban_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.kanban_columns (owner_id, project_id, name, position)
  values
    (new.owner_id, new.id, 'Not Started', 0),
    (new.owner_id, new.id, 'In Progress', 1),
    (new.owner_id, new.id, 'Completed', 2);
  return new;
end;
$$;

create trigger on_project_created_seed_kanban
  after insert on public.projects
  for each row execute function public.seed_kanban_defaults();


-- ---------------------------------------------------------------------------
-- Notes + attachments.
--
-- project_id is nullable on both: null means the "Miscellaneous" bucket, the
-- home for notes captured before you know where they belong. attachments
-- follows suit, or a Miscellaneous note silently could not take files.
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  name text not null,
  content text not null default '',
  position int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create policy "own notes" on public.notes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index notes_project_idx on public.notes (project_id, position);
create index notes_owner_updated_idx on public.notes (owner_id, updated_at desc);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  note_id uuid references public.notes (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);
alter table public.attachments enable row level security;
create policy "own attachments" on public.attachments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index attachments_project_idx on public.attachments (project_id);
create index attachments_note_idx on public.attachments (note_id);

-- Storage bucket. The 25 MB cap is enforced here as well as in the client, so
-- a large file is rejected even if someone calls the API directly.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;

create policy "own attachment objects read" on storage.objects
  for select using (bucket_id = 'attachments' and owner = auth.uid());
create policy "own attachment objects insert" on storage.objects
  for insert with check (bucket_id = 'attachments' and owner = auth.uid());
create policy "own attachment objects delete" on storage.objects
  for delete using (bucket_id = 'attachments' and owner = auth.uid());


-- ---------------------------------------------------------------------------
-- Inventory — stock and finance stay in sync by trigger, so a sale is entered
-- once rather than in two places.
-- ---------------------------------------------------------------------------
create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  label text,
  cost_per_unit numeric(14, 2) not null default 0 check (cost_per_unit >= 0),
  sale_price numeric(14, 2) not null default 0 check (sale_price >= 0),
  stock_units int not null default 0 check (stock_units >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
alter table public.inventory_products enable row level security;
create policy "own inventory products" on public.inventory_products
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.inventory_sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.inventory_products (id) on delete cascade,
  buyer text not null,
  units int not null check (units > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  sold_on date not null default current_date,
  delivered boolean not null default false,
  paid boolean not null default false,
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.inventory_sales enable row level security;
create policy "own inventory sales" on public.inventory_sales
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index inventory_sales_product_idx on public.inventory_sales (product_id);

-- A logged sale decrements stock and auto-creates the finance payment entry.
create or replace function public.handle_new_sale()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pname text;
  pay_id uuid;
begin
  update public.inventory_products
  set stock_units = stock_units - new.units
  where id = new.product_id;

  select name into pname from public.inventory_products where id = new.product_id;

  insert into public.payments (owner_id, counterparty, amount, status, received_on, note)
  values (
    new.owner_id,
    new.buyer,
    new.units * new.unit_price,
    case when new.paid then 'completed' else 'awaited' end,
    case when new.paid then new.sold_on else null end,
    pname || ' x ' || new.units || ' (inventory sale)'
  )
  returning id into pay_id;

  new.payment_id := pay_id;
  return new;
end;
$$;

create trigger on_inventory_sale
  before insert on public.inventory_sales
  for each row execute function public.handle_new_sale();

-- Marking a sale paid/unpaid later keeps the linked payment in sync.
create or replace function public.sync_sale_payment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.paid is distinct from old.paid and new.payment_id is not null then
    update public.payments
    set status = case when new.paid then 'completed' else 'awaited' end,
        received_on = case when new.paid then current_date else null end
    where id = new.payment_id;
  end if;
  return new;
end;
$$;

create trigger on_inventory_sale_update
  after update on public.inventory_sales
  for each row execute function public.sync_sale_payment();

-- Deleting a sale restores stock. The payment row stays: money history is real
-- even when the sale record is removed.
create or replace function public.handle_sale_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.inventory_products
  set stock_units = stock_units + old.units
  where id = old.product_id;
  return old;
end;
$$;

create trigger on_inventory_sale_delete
  before delete on public.inventory_sales
  for each row execute function public.handle_sale_delete();


-- ---------------------------------------------------------------------------
-- Key dates, quick capture, habits, weekly review
-- ---------------------------------------------------------------------------
create table public.key_dates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  on_date date not null,
  created_at timestamptz not null default now()
);
alter table public.key_dates enable row level security;
create policy "own key dates" on public.key_dates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index key_dates_owner_date_idx on public.key_dates (owner_id, on_date);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.inbox_items enable row level security;
create policy "own inbox" on public.inbox_items
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- month is 'YYYY-MM'; null means an ongoing habit that shows in every month.
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  month text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
alter table public.habits enable row level security;
create policy "own habits" on public.habits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  on_date date not null default current_date,
  unique (habit_id, on_date)
);
alter table public.habit_checks enable row level security;
create policy "own habit checks" on public.habit_checks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index habit_checks_habit_date_idx on public.habit_checks (habit_id, on_date desc);

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  what_happened text not null default '',
  whats_open text not null default '',
  whats_next text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (owner_id, week_start)
);
alter table public.weekly_reviews enable row level security;
create policy "own weekly reviews" on public.weekly_reviews
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());


-- ---------------------------------------------------------------------------
-- Time logger. Minutes-of-day; overnight blocks are split at midnight by
-- convention. quadrant null = "Life" (unclassified).
-- ---------------------------------------------------------------------------
create table public.time_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  on_date date not null default current_date,
  start_min int not null check (start_min >= 0 and start_min < 1440),
  end_min int not null check (end_min > 0 and end_min <= 1440),
  activity text not null,
  quadrant text check (quadrant in ('do_now', 'schedule', 'delegate', 'skip')),
  created_at timestamptz not null default now(),
  check (end_min > start_min)
);
alter table public.time_logs enable row level security;
create policy "own time logs" on public.time_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index time_logs_owner_date_idx on public.time_logs (owner_id, on_date);


-- ---------------------------------------------------------------------------
-- Scrapbook: free-form boards. Items are absolutely positioned (x/y/w/h/z),
-- so this is a 2D analogue of the kanban `position` int, not a document.
-- Images reuse `attachments` and its bucket, inheriting the size cap, the
-- per-owner storage policies and signed-URL access.
-- ---------------------------------------------------------------------------
create table public.scrapbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  project_id uuid references public.projects (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.scrapbooks enable row level security;
create policy "own scrapbooks" on public.scrapbooks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index scrapbooks_owner_updated_idx on public.scrapbooks (owner_id, updated_at desc);

create table public.scrapbook_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scrapbook_id uuid not null references public.scrapbooks (id) on delete cascade,
  kind text not null check (kind in ('text', 'heading', 'image')),
  content text not null default '',
  attachment_id uuid references public.attachments (id) on delete set null,
  x int not null default 0,
  y int not null default 0,
  w int not null default 240,
  h int not null default 160,
  z int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.scrapbook_items enable row level security;
create policy "own scrapbook items" on public.scrapbook_items
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index scrapbook_items_board_idx on public.scrapbook_items (scrapbook_id, z);


-- ---------------------------------------------------------------------------
-- Optional integrations.
--
-- google_tokens: Supabase hands the client a provider access token that dies in
-- ~1h and never refreshes it. The long-lived refresh token is banked here and
-- the `google-token` edge function exchanges it, so the Google client secret
-- never reaches the browser. Only used when Google Calendar is enabled.
--
-- push_subscriptions / reminder_log: web-push. reminder_log makes the sender
-- idempotent — the function URL is public by necessity, so it must be safe to
-- hit repeatedly. Scheduling the daily job is a manual step, deliberately not
-- in this migration: it needs YOUR project's function URL.
-- See docs/push-notifications.md.
-- ---------------------------------------------------------------------------
create table public.google_tokens (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.google_tokens enable row level security;
create policy "own google token" on public.google_tokens
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.push_subscriptions (
  endpoint text primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.reminder_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  sent_on date not null,
  primary key (owner_id, sent_on)
);
alter table public.reminder_log enable row level security;
-- No policies and no grants: only the service role (edge function) touches it.


-- ---------------------------------------------------------------------------
-- Privileges.
--
-- RLS above is the real gate; these grants only let the `authenticated` role
-- reach the tables at all. Recent Supabase does not add them automatically, and
-- without them PostgREST returns 403 despite correct policies.
--
-- allowed_emails and reminder_log get no CRUD grants. That is not enough on its
-- own: Supabase sets default privileges on `public` that hand every new table
-- TRUNCATE to anon and authenticated, and TRUNCATE bypasses RLS — so the
-- allowlist could be emptied by anyone holding a token. Revoke explicitly.
-- ---------------------------------------------------------------------------
revoke all on public.allowed_emails from anon, authenticated;
revoke all on public.reminder_log from anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.projects,
  public.finance_categories,
  public.expenses,
  public.payments,
  public.todo_lists,
  public.todos,
  public.contacts,
  public.kanban_columns,
  public.kanban_cards,
  public.notes,
  public.attachments,
  public.inventory_products,
  public.inventory_sales,
  public.key_dates,
  public.inbox_items,
  public.habits,
  public.habit_checks,
  public.weekly_reviews,
  public.time_logs,
  public.scrapbooks,
  public.scrapbook_items,
  public.google_tokens,
  public.push_subscriptions
to authenticated;
