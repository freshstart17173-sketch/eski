-- eski, profiles. run this after schema.sql, in the supabase sql editor.
-- safe to re-run.
--
-- WHY THIS EXISTS: comics.owner_name is a display name copied from the oauth
-- provider. Two people called "Alex" are indistinguishable by it, and it gives
-- a profile no stable address. A handle is the identity; the display name is
-- just what you call yourself today.
--
-- comics.owner_name stays as it is. It is a snapshot of who published a thing,
-- which is the right behaviour for attribution: renaming yourself should not
-- silently rewrite the byline on work you already shipped. The profile is the
-- live identity, the byline is the historical one, and the link between them
-- is owner_id.

-- the modal shows a comic's description, and comics had nowhere to put one.
-- idempotent, so it is safe whether or not you have already run this file.
alter table comics add column if not exists description text;

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  -- the address. lowercase, url safe, and the one thing that must be unique.
  handle       text not null unique
               check (handle ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$'),
  display_name text,
  bio          text check (bio is null or length(bio) <= 400),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create index if not exists profiles_handle_idx on profiles (lower(handle));

alter table profiles enable row level security;

-- profiles are public: a byline that nobody can open is not attribution
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (true);

-- you may only create or edit your own, and never reassign it
drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update, delete on profiles to authenticated;
grant select on profiles to anon;

-- ============================================================ phase 2, later
--   create table saves (user_id, comic_id, created_at, primary key (user_id, comic_id))
--     -- the "saved" shelf on a profile. public read, owner write, no delete
--     -- policy needed beyond your own row.
--   parts (id, comic_id, owner_id, kind 'vo'|'soundtrack', ...)
--     -- what fills the "contributed to" shelf. until it exists that section
--     -- is honestly empty rather than faked from comics you own.
