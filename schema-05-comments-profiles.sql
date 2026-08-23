-- eski schema · 05 · comments + profiles  (CANON §E.8.5)
-- Comments are POST-level and public-context only (a server file discusses in its
-- channel, §E.2). Commenting is gated to the post author + friends of the author;
-- is_friend() is stubbed false here and redefined with friendships in group 6.

-- ── is_friend stub (real definition lands in group 6) ──────────────────────
create or replace function is_friend(other uuid) returns boolean
  language sql stable security definer set search_path = public as $$ select false; $$;

-- ── comments ───────────────────────────────────────────────────────────────
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  work_id     uuid not null references works(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  context     text not null default 'public' check (context in ('public')),
  body        text,
  parent_id   uuid references comments(id) on delete cascade,
  resolved_at timestamptz,
  deleted_at  timestamptz
);

alter table comments enable row level security;

drop policy if exists cmt_read   on comments;
drop policy if exists cmt_insert on comments;
drop policy if exists cmt_update on comments;
drop policy if exists cmt_delete on comments;
-- read: anyone who can read the underlying work
create policy cmt_read on comments for select using (can_read_work(work_id));
-- write: you must be able to read the work AND be its author or a friend of the author
create policy cmt_insert on comments for insert with check (
  user_id = (select auth.uid())
  and can_read_work(work_id)
  and (
    exists (select 1 from works w where w.id = work_id and w.author_id = (select auth.uid()))
    or is_friend((select author_id from works w where w.id = work_id))
  )
);
-- edit/tombstone your own; the post author (work writer) may resolve/remove
create policy cmt_update on comments for update
  using (user_id = (select auth.uid()) or can_write_work(work_id))
  with check (user_id = (select auth.uid()) or can_write_work(work_id));
create policy cmt_delete on comments for delete
  using (user_id = (select auth.uid()) or can_write_work(work_id));

-- ── profiles ───────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  handle      text unique,
  name        text,
  bio         text,
  avatar_key  text,
  banner_key  text,                    -- profile hero banner (distinct from avatar)
  status_emoji text,
  status_text text,
  status_expires_at timestamptz,
  presence_state text not null default 'online' check (presence_state in ('online','idle','dnd','invisible')),
  tz          text,
  pronouns    text,
  links       jsonb
);

alter table profiles enable row level security;

drop policy if exists prof_read   on profiles;
drop policy if exists prof_insert on profiles;
drop policy if exists prof_update on profiles;
-- the profile card is public (the member popout reads another user's card, §E.9)
create policy prof_read   on profiles for select using (true);
create policy prof_insert on profiles for insert with check (id = (select auth.uid()));
create policy prof_update on profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ── grants ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on comments to authenticated;
grant select on comments to anon;                 -- comments on public posts
grant select, insert, update, delete on profiles to authenticated;
grant select on profiles to anon;                 -- public profile cards
grant execute on function is_friend(uuid) to anon, authenticated;
