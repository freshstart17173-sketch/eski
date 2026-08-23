-- eski schema · 03 · works, storage, placement, folders  (CANON §B.3, §D.2, §E.8.3)
--
-- The visibility rule (§B.3) is the load-bearing read policy. It's captured once in
-- can_read_work() (SECURITY DEFINER, so it evaluates the cross-table checks without
-- recursing through RLS) and reused by every child table (work_items, content_tags,
-- work_collaborators). dm_member() is stubbed false here and redefined in group 6.
--
-- CANON §E.1 lists works' owner_type/owner_id as the PAYING account only; a work also
-- needs its uploader, so `author_id` is added (the "Posted by" link + own-work reads).

-- ── content-addressed storage ──────────────────────────────────────────────
create table if not exists media_blobs (
  sha256   text primary key,
  bytes    bigint not null,
  refcount int not null default 0        -- GC'd by trigger (P2) at 0
);

create table if not exists storage_meters (
  owner_type text not null check (owner_type in ('user','server')),
  owner_id   uuid not null,
  bytes_used bigint not null default 0,  -- sum of DISTINCT owned blobs (dedup)
  updated_at timestamptz not null default now(),
  primary key (owner_type, owner_id)
);

create table if not exists storage_balance (
  owner_type text not null check (owner_type in ('user','server')),
  owner_id   uuid not null,
  purchased_gb int not null default 0,
  status     text not null default 'active',
  stripe_customer text,
  primary key (owner_type, owner_id)
);

-- ── folders (nested server file tree) ──────────────────────────────────────
create table if not exists folders (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  server_id  uuid not null references servers(id) on delete cascade,
  parent_id  uuid references folders(id) on delete cascade,   -- null = server root
  name       text not null,
  archived   boolean not null default false,
  locked     boolean not null default false
);

-- ── works ──────────────────────────────────────────────────────────────────
create table if not exists works (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id  uuid not null references auth.users(id) on delete cascade,  -- uploader
  owner_type text not null check (owner_type in ('user','server')),      -- paying account
  owner_id   uuid not null,
  visibility text not null default 'public' check (visibility in ('public','personal','server')),
  server_id  uuid references servers(id) on delete cascade,
  title      text,
  file_ext   text,
  kind       text,                    -- image/video/audio/text/other → renderer
  blob_sha   text references media_blobs(sha256),
  bytes      bigint not null default 0,
  hidden     boolean not null default false,   -- library declutter (still works in chat)
  approved_at timestamptz default now(),        -- null = held for approval (P2 trigger)
  deleted_at timestamptz,                        -- soft-delete / Trash
  search_tsv tsvector                            -- maintained by trigger in P2
);

create table if not exists work_items (
  id       uuid primary key default gen_random_uuid(),
  work_id  uuid not null references works(id) on delete cascade,
  blob_sha text references media_blobs(sha256),
  position int not null default 0
);

create table if not exists placement (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  work_id    uuid not null references works(id) on delete cascade,
  surface    text not null check (surface in ('feed','server','dm')),
  surface_id uuid,                     -- server id / dm id (null for feed)
  channel_id uuid,                     -- FK added with channels (group 4)
  folder_id  uuid references folders(id) on delete set null,
  placed_by  uuid references auth.users(id) on delete set null
);

create table if not exists work_collaborators (
  work_id   uuid not null references works(id) on delete cascade,
  author_id uuid,                      -- who credited them
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text,
  status    text not null check (status in ('accepted','pending')),
  primary key (work_id, user_id)
);

create table if not exists content_tags (
  id      uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id) on delete cascade,
  tag     text not null,
  unique (work_id, tag)
);

create table if not exists starred_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  work_id    uuid not null references works(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create table if not exists share_links (
  token      text primary key,
  work_id    uuid not null references works(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  access     text not null default 'view' check (access in ('view')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── helpers ────────────────────────────────────────────────────────────────
-- dm_member stub (real definition lands with DMs in group 6)
create or replace function dm_member(dm uuid) returns boolean
  language sql stable security definer set search_path = public as $$ select false; $$;

-- The §B.3 visibility rule, one place. Author & paying user always read their own
-- (incl. trashed → the Trash smart-folder / restore). Everyone else reads a
-- non-trashed, non-held work only through public / server-membership / a placement /
-- a live share-link token.
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
                (p.surface = 'server' and member_of(p.surface_id))
             or (p.surface = 'dm' and dm_member(p.surface_id))))
          or exists (select 1 from share_links sl where sl.work_id = w.id
               and sl.revoked_at is null and (sl.expires_at is null or sl.expires_at > now()))
        )
      )
    )
  );
$$;

-- write gate on a work: its author, or an admin of the work's server (takedown).
create or replace function can_write_work(wid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from works w where w.id = wid and (
      w.author_id = (select auth.uid())
      or (w.server_id is not null and is_server_admin(w.server_id))
    )
  );
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table media_blobs        enable row level security;  -- server-managed: no client policy = deny all
alter table storage_meters     enable row level security;
alter table storage_balance    enable row level security;
alter table folders            enable row level security;
alter table works              enable row level security;
alter table work_items         enable row level security;
alter table placement          enable row level security;
alter table work_collaborators enable row level security;
alter table content_tags       enable row level security;
alter table starred_items      enable row level security;
alter table share_links        enable row level security;

-- storage meters: a user sees their own; a server's members see the server meter.
drop policy if exists sm_meter_read on storage_meters;
create policy sm_meter_read on storage_meters for select using (
  (owner_type = 'user'   and owner_id = (select auth.uid()))
  or (owner_type = 'server' and member_of(owner_id))
);

-- storage balance (the slider): user's own, or a server's manage_billing holders.
drop policy if exists sb_read  on storage_balance;
drop policy if exists sb_write on storage_balance;
create policy sb_read  on storage_balance for select using (
  (owner_type = 'user'   and owner_id = (select auth.uid()))
  or (owner_type = 'server' and has_perm(owner_id, perm_bit('manage_billing'))));
create policy sb_write on storage_balance for all using (
  (owner_type = 'user'   and owner_id = (select auth.uid()))
  or (owner_type = 'server' and has_perm(owner_id, perm_bit('manage_billing')))
) with check (
  (owner_type = 'user'   and owner_id = (select auth.uid()))
  or (owner_type = 'server' and has_perm(owner_id, perm_bit('manage_billing'))));

-- folders: member read; manage_channels write; a locked folder is read-only.
drop policy if exists folders_read  on folders;
drop policy if exists folders_write on folders;
create policy folders_read  on folders for select using (member_of(server_id));
create policy folders_write on folders for all
  using (has_perm(server_id, perm_bit('manage_channels')) and not locked)
  with check (has_perm(server_id, perm_bit('manage_channels')));

-- works: the §B.3 read rule; write via can_write_work; insert gated by upload perm.
drop policy if exists works_read   on works;
drop policy if exists works_insert on works;
drop policy if exists works_update on works;
drop policy if exists works_delete on works;
create policy works_read on works for select using (can_read_work(id));
create policy works_insert on works for insert with check (
  author_id = (select auth.uid())
  and (visibility <> 'server' or (server_id is not null and member_of(server_id)))
  and case owner_type
        when 'user'   then owner_id = (select auth.uid())
        when 'server' then member_of(owner_id) and has_perm(owner_id, perm_bit('upload'))
      end
);
create policy works_update on works for update using (can_write_work(id)) with check (can_write_work(id));
create policy works_delete on works for delete using (can_write_work(id));

-- child tables inherit the work's readability; writes gated to the work's writers.
drop policy if exists wi_read  on work_items;
drop policy if exists wi_write on work_items;
create policy wi_read  on work_items for select using (can_read_work(work_id));
create policy wi_write on work_items for all using (can_write_work(work_id)) with check (can_write_work(work_id));

drop policy if exists ct_read  on content_tags;
drop policy if exists ct_write on content_tags;
create policy ct_read  on content_tags for select using (can_read_work(work_id));
create policy ct_write on content_tags for all
  using (can_write_work(work_id) or exists (
     select 1 from work_collaborators c
     where c.work_id = content_tags.work_id and c.user_id = (select auth.uid()) and c.status = 'accepted'))
  with check (can_write_work(work_id) or exists (
     select 1 from work_collaborators c
     where c.work_id = content_tags.work_id and c.user_id = (select auth.uid()) and c.status = 'accepted'));

-- collaborators: readable with the work; owner/accepted add; the credited person can
-- always self-remove (delete their own row).
drop policy if exists wc_read       on work_collaborators;
drop policy if exists wc_add        on work_collaborators;
drop policy if exists wc_selfremove on work_collaborators;
create policy wc_read on work_collaborators for select using (can_read_work(work_id));
create policy wc_add  on work_collaborators for insert with check (
  can_write_work(work_id) or exists (
    select 1 from work_collaborators c
    where c.work_id = work_collaborators.work_id and c.user_id = (select auth.uid()) and c.status = 'accepted'));
create policy wc_selfremove on work_collaborators for delete using (
  user_id = (select auth.uid()) or can_write_work(work_id));

-- placement: readable by anyone who can see the surface (+ the placer).
drop policy if exists pl_read  on placement;
drop policy if exists pl_write on placement;
drop policy if exists pl_del   on placement;
create policy pl_read on placement for select using (
  placed_by = (select auth.uid())
  or surface = 'feed'
  or (surface = 'server' and member_of(surface_id))
  or (surface = 'dm' and dm_member(surface_id)));
create policy pl_write on placement for insert with check (
  placed_by = (select auth.uid()) and can_read_work(work_id));
create policy pl_del on placement for delete using (
  placed_by = (select auth.uid())
  or (surface = 'server' and is_server_admin(surface_id)));

-- stars: owner only.
drop policy if exists star_all on starred_items;
create policy star_all on starred_items for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- share links: the creator manages; outsiders read via resolve_share_link (P2).
drop policy if exists share_read  on share_links;
drop policy if exists share_write on share_links;
create policy share_read  on share_links for select using (
  created_by = (select auth.uid()) or can_write_work(work_id));
create policy share_write on share_links for all
  using (can_write_work(work_id)) with check (can_write_work(work_id));

-- ── grants ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on
  works, work_items, folders, placement, work_collaborators, content_tags,
  starred_items, share_links, storage_meters, storage_balance to authenticated;
-- public content is readable by anon (shared view / OG / signed-out browse)
grant select on works, work_items, content_tags to anon;
grant execute on function can_read_work(uuid), can_write_work(uuid), dm_member(uuid) to anon, authenticated;
