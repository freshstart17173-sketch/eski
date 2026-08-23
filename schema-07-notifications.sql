-- eski schema · 07 · notifications + prefs + saves  (CANON §E.8.7)
-- All owner-scoped. notifications rows are written by the P2 fanout triggers, not by
-- clients — there's no insert policy, so a client insert is refused; clients only
-- read / mark-read / delete their own. (Realtime publication is added in the P1 wrap.)

create table if not exists save_folders (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  parent_id  uuid references save_folders(id) on delete cascade,   -- null = personal root
  name       text not null
);

create table if not exists saved_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  work_id    uuid not null references works(id) on delete cascade,
  folder_id  uuid references save_folders(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('mention','comment','join','reaction','invite','friend')),
  actor_id    uuid references auth.users(id) on delete set null,
  server_id   uuid references servers(id) on delete cascade,
  target_type text,
  target_id   uuid,
  excerpt     text,
  read_at     timestamptz
);

create table if not exists server_prefs (
  user_id      uuid not null references auth.users(id) on delete cascade,
  server_id    uuid not null references servers(id) on delete cascade,
  level        text not null default 'all' check (level in ('all','mentions','none')),
  muted_until  timestamptz,
  suppress_everyone boolean not null default false,
  primary key (user_id, server_id)
);

create table if not exists channel_prefs (
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel_id  uuid not null references channels(id) on delete cascade,
  level       text not null default 'default' check (level in ('all','mentions','none','default')),
  muted_until timestamptz,
  primary key (user_id, channel_id)
);

alter table save_folders  enable row level security;
alter table saved_items   enable row level security;
alter table notifications enable row level security;
alter table server_prefs  enable row level security;
alter table channel_prefs enable row level security;

drop policy if exists sf_all on save_folders;
create policy sf_all on save_folders for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists si_all on saved_items;
create policy si_all on saved_items for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- notifications: read/mark-read/delete your own; inserts come from the P2 triggers.
drop policy if exists notif_read   on notifications;
drop policy if exists notif_update on notifications;
drop policy if exists notif_delete on notifications;
create policy notif_read   on notifications for select using (user_id = (select auth.uid()));
create policy notif_update on notifications for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notif_delete on notifications for delete using (user_id = (select auth.uid()));

drop policy if exists sp_all on server_prefs;
create policy sp_all on server_prefs for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists cp_all on channel_prefs;
create policy cp_all on channel_prefs for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on save_folders, saved_items, server_prefs, channel_prefs to authenticated;
grant select, update, delete on notifications to authenticated;   -- no insert: triggers only
