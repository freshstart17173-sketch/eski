-- eski schema · 02 · granular roles + permission helpers  (CANON §D.1, §E.8.2)
-- roles carry permission flags (bitmask); members hold roles; a member's power is
-- the OR of their roles' flags. The owner is implicitly all-flags.
--
-- ORDERING NOTE: channel_roles + can_view_channel (also §E.8.2) depend on channels,
-- which land in group 4 — so they're built there, with channels, not here. This is
-- the only split from the §E.8 grouping and it's a hard FK dependency.

-- ── permission flag catalogue (single source of the bit values) ────────────
-- Grouped per CANON §D.1: Server / Members / Content / per-channel.
create or replace function perm_bit(flag text) returns bigint
  language sql immutable as $$
  select case flag
    when 'manage_server'      then 1::bigint
    when 'manage_roles'       then 2
    when 'manage_channels'    then 4
    when 'manage_invites'     then 8
    when 'view_audit'         then 16
    when 'manage_billing'     then 32
    when 'kick'               then 64
    when 'ban'                then 128
    when 'timeout'            then 256
    when 'create_invite'      then 512
    when 'upload'             then 1024
    when 'add_tags'           then 2048
    when 'comment'            then 4096
    when 'pin_message'        then 8192
    when 'delete_any_message' then 16384
    when 'view_channel'       then 32768
    when 'send_messages'      then 65536
  end;
$$;

-- The @everyone baseline: every NON-admin flag ON (upload/add_tags/comment/
-- pin_message/send_messages/view_channel), every admin/manage flag OFF (§D.1 LOCKED).
create or replace function everyone_perms() returns bigint language sql immutable as $$
  select perm_bit('upload') | perm_bit('add_tags') | perm_bit('comment')
       | perm_bit('pin_message') | perm_bit('send_messages') | perm_bit('view_channel');
$$;

-- ── tables ─────────────────────────────────────────────────────────────────
create table if not exists roles (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  server_id   uuid not null references servers(id) on delete cascade,
  name        text not null,
  color       smallint,
  position    int not null default 0,
  permissions bigint not null default 0,
  is_default  boolean not null default false,       -- the @everyone role
  hide_posts_by_default boolean not null default false  -- role-scoped auto-hide (§E.1)
);
-- exactly one @everyone role per server
create unique index if not exists roles_one_default on roles(server_id) where is_default;

create table if not exists member_roles (
  server_id uuid not null,
  user_id   uuid not null,
  role_id   uuid not null references roles(id) on delete cascade,
  primary key (server_id, user_id, role_id),
  foreign key (server_id, user_id) references server_members(server_id, user_id) on delete cascade
);

-- ── helpers ────────────────────────────────────────────────────────────────
-- OR of the member's roles' flags, with the owner implicitly holding every flag.
create or replace function has_perm(sid uuid, flag bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from servers s where s.id = sid and s.owner_id = (select auth.uid()))
      or exists (
        select 1 from member_roles mr
        join roles r on r.id = mr.role_id
        where mr.server_id = sid
          and mr.user_id = (select auth.uid())
          and (r.permissions & flag) = flag
      );
$$;

-- admin == owner OR manage_server (widens the P1.1 owner-only stub, §E.8.2).
create or replace function is_server_admin(sid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_perm(sid, public.perm_bit('manage_server'));
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table roles        enable row level security;
alter table member_roles enable row level security;

drop policy if exists roles_read on roles;
drop policy if exists roles_write on roles;
create policy roles_read  on roles for select using (member_of(server_id));
create policy roles_write on roles for all
  using (has_perm(server_id, perm_bit('manage_roles')))
  with check (has_perm(server_id, perm_bit('manage_roles')));

drop policy if exists mr_read on member_roles;
drop policy if exists mr_write on member_roles;
create policy mr_read  on member_roles for select using (member_of(server_id));
create policy mr_write on member_roles for all
  using (has_perm(server_id, perm_bit('manage_roles')))
  with check (has_perm(server_id, perm_bit('manage_roles')));

-- ── grants ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on roles, member_roles to authenticated;
grant execute on function has_perm(uuid, bigint), perm_bit(text), everyone_perms() to anon, authenticated;
