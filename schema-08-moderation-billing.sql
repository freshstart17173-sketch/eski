-- eski schema · 08 · moderation + billing  (CANON §E.8.8)
-- server_bans/audit_log are admin-scoped; audit_log + invoices are written by the P2
-- moderation RPCs / the Stripe webhook (no client insert). sessions are owner-only.
-- (server_members.timeout_until was added back in group 1.)
--
-- reports gains a nullable server_id (CANON §E.1 omits it) so a server's admins can
-- read reports about their server; a global report (null server_id) is handled by an
-- out-of-band path, not client RLS.

create table if not exists server_bans (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  server_id  uuid not null references servers(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  banned_by  uuid references auth.users(id) on delete set null,
  reason     text,
  until      timestamptz,
  unique (server_id, user_id)
);

create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  server_id   uuid references servers(id) on delete cascade,
  target_type text,
  target_id   uuid,
  reason      text
);

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  server_id   uuid not null references servers(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  meta        jsonb
);

create table if not exists invoices (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  owner_type       text not null check (owner_type in ('user','server')),
  owner_id         uuid not null,
  stripe_invoice_id text,
  amount_cents     int,
  currency         text,
  status           text check (status in ('paid','open','void')),
  hosted_url       text
);

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  device       text,
  ip_hint      text,
  last_seen_at timestamptz,
  current      boolean not null default false
);

alter table server_bans enable row level security;
alter table reports     enable row level security;
alter table audit_log   enable row level security;
alter table invoices    enable row level security;
alter table sessions    enable row level security;

-- bans: admins (ban perm or admin) manage.
drop policy if exists ban_read  on server_bans;
drop policy if exists ban_write on server_bans;
create policy ban_read  on server_bans for select using (
  is_server_admin(server_id) or has_perm(server_id, perm_bit('ban')));
create policy ban_write on server_bans for all
  using (is_server_admin(server_id) or has_perm(server_id, perm_bit('ban')))
  with check (is_server_admin(server_id) or has_perm(server_id, perm_bit('ban')));

-- reports: file your own; the reporter and the target server's admins can read.
drop policy if exists rep_insert on reports;
drop policy if exists rep_read   on reports;
create policy rep_insert on reports for insert with check (reporter_id = (select auth.uid()));
create policy rep_read   on reports for select using (
  reporter_id = (select auth.uid())
  or (server_id is not null and is_server_admin(server_id)));

-- audit log: admins with view_audit read; rows are written by the P2 RPCs.
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (
  has_perm(server_id, perm_bit('view_audit')) or is_server_admin(server_id));

-- invoices: the paying account reads; written by the Stripe webhook (service role).
drop policy if exists inv_read on invoices;
create policy inv_read on invoices for select using (
  (owner_type = 'user'   and owner_id = (select auth.uid()))
  or (owner_type = 'server' and has_perm(owner_id, perm_bit('manage_billing'))));

-- sessions: owner only (account switcher + sign-out-everywhere).
drop policy if exists sess_all on sessions;
create policy sess_all on sessions for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on server_bans to authenticated;
grant select, insert on reports to authenticated;
grant select on audit_log to authenticated;      -- writes are RPC-only
grant select on invoices to authenticated;         -- writes are webhook-only
grant select, insert, update, delete on sessions to authenticated;
