-- eski schema · 04 · channels + messages  (CANON §D.1, §E.8.4)
-- Lands channel_roles + can_view_channel (deferred from group 2's §E.8.2 grouping
-- by their hard FK dependency on channels) and re-points the channel-scoped reads
-- (messages/pins + a work placed in a private channel) from member_of to
-- can_view_channel (§D.1). Written to the v2 overwrite grain: channel_roles is the
-- allow-only subset, zero rows = open to all members.

-- ── channel structure ──────────────────────────────────────────────────────
create table if not exists channel_categories (
  id        uuid primary key default gen_random_uuid(),
  server_id uuid not null references servers(id) on delete cascade,
  name      text not null,
  position  int not null default 0
);

create table if not exists channels (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  server_id   uuid not null references servers(id) on delete cascade,
  category_id uuid references channel_categories(id) on delete set null,
  name        text not null,
  kind        text not null default 'text' check (kind in ('text','voice')),
  topic       text,
  slowmode_sec int not null default 0,
  position    int not null default 0,
  default_folder_id uuid references folders(id) on delete set null,
  allowed_kinds text[],                 -- null = any; else a works.kind allow-list
  post_policy text not null default 'everyone' check (post_policy in ('everyone','admins'))
);

-- late FK: placement.channel_id → channels (placement was created in group 3)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'placement_channel_fk') then
    alter table placement add constraint placement_channel_fk
      foreign key (channel_id) references channels(id) on delete set null;
  end if;
end $$;

-- v1 private-channel allow-list: zero rows = open to all members.
create table if not exists channel_roles (
  channel_id uuid not null references channels(id) on delete cascade,
  role_id    uuid not null references roles(id) on delete cascade,
  primary key (channel_id, role_id)
);

-- ── messages & friends ─────────────────────────────────────────────────────
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text,
  parent_id  uuid references messages(id) on delete cascade,
  also_to_channel boolean not null default false,
  edited_at  timestamptz,
  deleted_at timestamptz,
  body_tsv   tsvector generated always as (to_tsvector('english', coalesce(body,''))) stored
);

create table if not exists message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null,
  primary key (message_id, user_id, emoji)
);

create table if not exists message_pins (
  channel_id uuid not null references channels(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  pinned_by  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (channel_id, message_id)
);

create table if not exists channel_reads (
  user_id      uuid not null references auth.users(id) on delete cascade,
  channel_id   uuid not null references channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

create table if not exists mentions (
  message_id     uuid not null references messages(id) on delete cascade,
  mentioned_user uuid not null references auth.users(id) on delete cascade,
  server_id      uuid references servers(id) on delete cascade,
  primary key (message_id, mentioned_user)
);

-- ── channel/message gate helpers ───────────────────────────────────────────
-- member of the channel's server AND (channel is open OR you hold a granted role
-- OR you manage channels / are the admin — owner/admin see all channels to manage
-- them, matching Discord's Administrator; this keeps the channel list and message
-- reads consistent with the FOR ALL manage policy, which also permits its SELECT).
create or replace function can_view_channel(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    where c.id = cid and member_of(c.server_id)
      and ( not exists (select 1 from channel_roles cr where cr.channel_id = cid)
            or is_server_admin(c.server_id)
            or has_perm(c.server_id, perm_bit('manage_channels'))
            or exists (select 1 from channel_roles cr
                       join member_roles mr on mr.role_id = cr.role_id
                       where cr.channel_id = cid and mr.user_id = (select auth.uid())) )
  );
$$;

create or replace function can_view_message(mid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select can_view_channel((select channel_id from messages where id = mid));
$$;

-- may post: can view + has send_messages + not timed out + (channel open or admin).
create or replace function can_post_channel(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    join server_members m on m.server_id = c.server_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
    where c.id = cid
      and can_view_channel(cid)
      and (m.timeout_until is null or m.timeout_until <= now())
      and has_perm(c.server_id, perm_bit('send_messages'))
      and (c.post_policy = 'everyone' or is_server_admin(c.server_id))
  );
$$;

-- may moderate a channel's messages (delete-any / unpin-any).
create or replace function can_moderate_channel(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels c where c.id = cid
    and (is_server_admin(c.server_id) or has_perm(c.server_id, perm_bit('delete_any_message'))));
$$;

-- react/pin gate: can view + not timed out (lighter than posting).
create or replace function can_interact_channel(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    join server_members m on m.server_id = c.server_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
    where c.id = cid and can_view_channel(cid)
      and (m.timeout_until is null or m.timeout_until <= now())
  );
$$;

-- ── re-point can_read_work / placement for private channels (§D.1) ──────────
create or replace function can_read_work(wid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from works w
    where w.id = wid and (
      w.author_id = (select auth.uid())
      or (w.owner_type = 'user' and w.owner_id = (select auth.uid()))
      or (
        w.deleted_at is null
        and (w.approved_at is not null
             or (w.server_id is not null and is_server_admin(w.server_id)))
        and (
          w.visibility = 'public'
          or (w.visibility = 'server' and member_of(w.server_id))
          or exists (select 1 from placement p where p.work_id = w.id and (
                (p.surface = 'server' and (
                    (p.channel_id is not null and can_view_channel(p.channel_id))
                 or (p.channel_id is null and member_of(p.surface_id))))
             or (p.surface = 'dm' and dm_member(p.surface_id))))
          or exists (select 1 from share_links sl where sl.work_id = w.id
               and sl.revoked_at is null and (sl.expires_at is null or sl.expires_at > now()))
        )
      )
    )
  );
$$;

drop policy if exists pl_read on placement;
create policy pl_read on placement for select using (
  placed_by = (select auth.uid())
  or surface = 'feed'
  or (surface = 'server' and (
        (channel_id is not null and can_view_channel(channel_id))
     or (channel_id is null and member_of(surface_id))))
  or (surface = 'dm' and dm_member(surface_id)));

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table channel_categories enable row level security;
alter table channels           enable row level security;
alter table channel_roles      enable row level security;
alter table messages           enable row level security;
alter table message_reactions  enable row level security;
alter table message_pins       enable row level security;
alter table channel_reads      enable row level security;
alter table mentions           enable row level security;

drop policy if exists cc_read on channel_categories;
drop policy if exists cc_write on channel_categories;
create policy cc_read  on channel_categories for select using (member_of(server_id));
create policy cc_write on channel_categories for all
  using (has_perm(server_id, perm_bit('manage_channels')))
  with check (has_perm(server_id, perm_bit('manage_channels')));

drop policy if exists ch_read on channels;
drop policy if exists ch_write on channels;
create policy ch_read  on channels for select using (can_view_channel(id));
create policy ch_write on channels for all
  using (has_perm(server_id, perm_bit('manage_channels')))
  with check (has_perm(server_id, perm_bit('manage_channels')));

drop policy if exists cr_read on channel_roles;
drop policy if exists cr_write on channel_roles;
create policy cr_read  on channel_roles for select using (
  exists (select 1 from channels c where c.id = channel_id and member_of(c.server_id)));
create policy cr_write on channel_roles for all
  using (exists (select 1 from channels c where c.id = channel_id and has_perm(c.server_id, perm_bit('manage_channels'))))
  with check (exists (select 1 from channels c where c.id = channel_id and has_perm(c.server_id, perm_bit('manage_channels'))));

-- messages: read = can_view_channel; insert = can_post_channel; edit/tombstone own
-- (or a moderator tombstones any); real delete stays soft (an update of deleted_at).
drop policy if exists msg_read on messages;
drop policy if exists msg_insert on messages;
drop policy if exists msg_update on messages;
drop policy if exists msg_delete on messages;
create policy msg_read on messages for select using (can_view_channel(channel_id));
create policy msg_insert on messages for insert with check (
  user_id = (select auth.uid()) and can_post_channel(channel_id));
create policy msg_update on messages for update
  using (user_id = (select auth.uid()) or can_moderate_channel(channel_id))
  with check (user_id = (select auth.uid()) or can_moderate_channel(channel_id));
create policy msg_delete on messages for delete
  using (user_id = (select auth.uid()) or can_moderate_channel(channel_id));

drop policy if exists mr_react_read on message_reactions;
drop policy if exists mr_react_write on message_reactions;
create policy mr_react_read on message_reactions for select using (can_view_message(message_id));
create policy mr_react_write on message_reactions for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and can_interact_channel((select channel_id from messages where id = message_id)));

drop policy if exists pin_read on message_pins;
drop policy if exists pin_insert on message_pins;
drop policy if exists pin_delete on message_pins;
create policy pin_read on message_pins for select using (can_view_channel(channel_id));
create policy pin_insert on message_pins for insert with check (
  pinned_by = (select auth.uid()) and can_view_channel(channel_id)
  and has_perm((select server_id from channels c where c.id = channel_id), perm_bit('pin_message')));
create policy pin_delete on message_pins for delete using (
  pinned_by = (select auth.uid()) or can_moderate_channel(channel_id));

drop policy if exists reads_all on channel_reads;
create policy reads_all on channel_reads for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- mentions: the mentioned user reads their own; rows are written by the P2 trigger.
drop policy if exists mentions_read on mentions;
create policy mentions_read on mentions for select using (mentioned_user = (select auth.uid()));

-- ── grants ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on
  channel_categories, channels, channel_roles, messages, message_reactions,
  message_pins, channel_reads, mentions to authenticated;
grant execute on function
  can_view_channel(uuid), can_view_message(uuid), can_post_channel(uuid),
  can_moderate_channel(uuid), can_interact_channel(uuid) to anon, authenticated;
