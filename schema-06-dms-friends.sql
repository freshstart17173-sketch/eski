-- eski schema · 06 · DMs + friendships  (CANON §E.8.6)
-- Promotes the dm_member() and is_friend() stubs to their real definitions, which
-- retroactively activates the DM-placement read (group 3/4) and the friend-of-author
-- comment gate (group 5).

-- ── friendships (add-by-handle, one ordered-pair edge) ─────────────────────
create table if not exists friendships (
  a_user       uuid not null references auth.users(id) on delete cascade,
  b_user       uuid not null references auth.users(id) on delete cascade,
  status       text not null check (status in ('pending','accepted','blocked')),
  requested_by uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (a_user, b_user),
  check (a_user < b_user)            -- ordered pair: one row per pair, either direction
);

-- ── DMs ────────────────────────────────────────────────────────────────────
create table if not exists dm_channels (
  id         uuid primary key default gen_random_uuid(),
  is_group   boolean not null default false,
  name       text,
  created_at timestamptz not null default now()
);

create table if not exists dm_members (
  dm_channel_id uuid not null references dm_channels(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  muted         boolean not null default false,
  pinned        boolean not null default false,
  hidden        boolean not null default false,   -- reworked "close DM" (reversible)
  last_read_at  timestamptz,
  primary key (dm_channel_id, user_id)
);

create table if not exists dm_messages (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  dm_channel_id uuid not null references dm_channels(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  body          text,
  parent_id     uuid references dm_messages(id) on delete cascade,
  edited_at     timestamptz,
  deleted_at    timestamptz
);

create table if not exists dm_message_reactions (
  dm_message_id uuid not null references dm_messages(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  emoji         text not null,
  primary key (dm_message_id, user_id, emoji)
);

-- ── real helpers (replace the stubs) ───────────────────────────────────────
create or replace function dm_member(dm uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_members m where m.dm_channel_id = dm and m.user_id = (select auth.uid()));
$$;

create or replace function is_friend(other uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted' and (
      (f.a_user = (select auth.uid()) and f.b_user = other)
      or (f.a_user = other and f.b_user = (select auth.uid())))
  );
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table friendships          enable row level security;
alter table dm_channels          enable row level security;
alter table dm_members           enable row level security;
alter table dm_messages          enable row level security;
alter table dm_message_reactions enable row level security;

-- friendships: only the two parties see or change the edge.
drop policy if exists fr_read   on friendships;
drop policy if exists fr_insert on friendships;
drop policy if exists fr_update on friendships;
drop policy if exists fr_delete on friendships;
create policy fr_read on friendships for select using (
  a_user = (select auth.uid()) or b_user = (select auth.uid()));
create policy fr_insert on friendships for insert with check (
  requested_by = (select auth.uid())
  and (a_user = (select auth.uid()) or b_user = (select auth.uid())));
create policy fr_update on friendships for update
  using (a_user = (select auth.uid()) or b_user = (select auth.uid()))
  with check (a_user = (select auth.uid()) or b_user = (select auth.uid()));
create policy fr_delete on friendships for delete using (
  a_user = (select auth.uid()) or b_user = (select auth.uid()));

-- dm_channels: readable by its members (creation is the create_dm RPC).
drop policy if exists dmc_read on dm_channels;
create policy dmc_read on dm_channels for select using (dm_member(id));

-- dm_members: see co-members; edit only your own mute/pin/hidden/last_read.
drop policy if exists dmm_read   on dm_members;
drop policy if exists dmm_update on dm_members;
create policy dmm_read   on dm_members for select using (dm_member(dm_channel_id) or user_id = (select auth.uid()));
create policy dmm_update on dm_members for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- dm_messages: members read; insert own; edit/tombstone own.
drop policy if exists dmsg_read   on dm_messages;
drop policy if exists dmsg_insert on dm_messages;
drop policy if exists dmsg_update on dm_messages;
drop policy if exists dmsg_delete on dm_messages;
create policy dmsg_read   on dm_messages for select using (dm_member(dm_channel_id));
create policy dmsg_insert on dm_messages for insert with check (user_id = (select auth.uid()) and dm_member(dm_channel_id));
create policy dmsg_update on dm_messages for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy dmsg_delete on dm_messages for delete using (user_id = (select auth.uid()));

-- dm reactions: members read; own add/remove.
drop policy if exists dmr_read  on dm_message_reactions;
drop policy if exists dmr_write on dm_message_reactions;
create policy dmr_read  on dm_message_reactions for select using (
  dm_member((select dm_channel_id from dm_messages m where m.id = dm_message_id)));
create policy dmr_write on dm_message_reactions for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and dm_member((select dm_channel_id from dm_messages m where m.id = dm_message_id)));

-- ── grants ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on
  friendships, dm_channels, dm_members, dm_messages, dm_message_reactions to authenticated;
grant execute on function dm_member(uuid), is_friend(uuid) to anon, authenticated;
