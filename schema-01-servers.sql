-- eski schema · 01 · servers, members, invites + gate helpers  (CANON §E.8.1, P1.1)
-- Re-runnable. RLS is the fence; the UI is only the signpost.
-- Gate helpers are SECURITY DEFINER (owned by postgres → BYPASSRLS inside), which
-- is what stops a server_members policy that calls member_of() from recursing.

-- ── tables ────────────────────────────────────────────────────────────────
create table if not exists servers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  slug        text unique,
  name        text not null,
  description text,
  icon_key    text,                       -- square rail/header icon
  cover_key   text,                       -- wide banner (distinct from icon, gallery #34)
  hide_posts_by_default boolean not null default false,  -- server-scoped auto-hide (§E.1)
  owner_id    uuid not null references auth.users(id) on delete cascade
);

create table if not exists server_members (
  server_id   uuid not null references servers(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  color       smallint,                   -- member-hue index (0..29), assigned on join
  status      text not null default 'active',
  timeout_until timestamptz,              -- a timed-out member can't post until this passes
  posts_require_approval boolean not null default false,   -- gallery #57
  joined_at   timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table if not exists server_invites (
  code        text primary key,
  server_id   uuid not null references servers(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  max_uses    int,
  uses        int not null default 0
);

-- ── gate helpers (every server policy calls these) ─────────────────────────
create or replace function member_of(sid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from server_members m
    where m.server_id = sid
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

-- For now admin == owner. P1.24 widens this to owner OR has_perm(manage_server).
create or replace function is_server_admin(sid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from servers s where s.id = sid and s.owner_id = (select auth.uid()));
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table servers        enable row level security;
alter table server_members enable row level security;
alter table server_invites enable row level security;

-- servers: read = member (owner always, even before their membership row lands via
-- the create RPC); write = admin; delete = owner only (CANON §B.2).
drop policy if exists servers_read   on servers;
drop policy if exists servers_insert on servers;
drop policy if exists servers_update on servers;
drop policy if exists servers_delete on servers;
create policy servers_read   on servers for select using (owner_id = (select auth.uid()) or member_of(id));
create policy servers_insert on servers for insert with check (owner_id = (select auth.uid()));
create policy servers_update on servers for update using (is_server_admin(id)) with check (is_server_admin(id));
create policy servers_delete on servers for delete using (owner_id = (select auth.uid()));

-- server_members: read = co-members (+ always your own row); direct insert/update =
-- admin only (joining is the definer RPC join_via_invite, which bypasses this);
-- delete = self-leave or admin-remove.
drop policy if exists sm_read   on server_members;
drop policy if exists sm_insert on server_members;
drop policy if exists sm_update on server_members;
drop policy if exists sm_delete on server_members;
create policy sm_read   on server_members for select using (member_of(server_id) or user_id = (select auth.uid()));
create policy sm_insert on server_members for insert with check (is_server_admin(server_id));
create policy sm_update on server_members for update using (is_server_admin(server_id)) with check (is_server_admin(server_id));
create policy sm_delete on server_members for delete using (user_id = (select auth.uid()) or is_server_admin(server_id));

-- server_invites: admin only; use is via join_via_invite (P2).
drop policy if exists si_read   on server_invites;
drop policy if exists si_insert on server_invites;
drop policy if exists si_update on server_invites;
drop policy if exists si_delete on server_invites;
create policy si_read   on server_invites for select using (is_server_admin(server_id));
create policy si_insert on server_invites for insert with check (is_server_admin(server_id));
create policy si_update on server_invites for update using (is_server_admin(server_id)) with check (is_server_admin(server_id));
create policy si_delete on server_invites for delete using (is_server_admin(server_id));

-- ── grants (RLS still restricts rows; without a grant PostgREST 401s) ───────
grant select, insert, update, delete on servers, server_members, server_invites to authenticated;
grant execute on function member_of(uuid), is_server_admin(uuid) to anon, authenticated;
