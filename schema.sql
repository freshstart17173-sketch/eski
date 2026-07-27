-- eski, phase 1 schema. paste into the supabase sql editor and run once.
--
-- SCOPE: exactly what one signed-in owner needs to publish a finished comic and
-- what a reader needs to render it. no slots, no parts, no mixes: those model a
-- SECOND contributor and there isn't one yet. the phase 2 alters are listed at
-- the bottom and every one of them is additive.
--
-- D17: content lives as loose content-addressed objects on R2, one per page
-- image and per audio clip. these tables hold the metadata and the object KEYS.
-- STORE KEYS, NEVER FULL URLS (14.5): the reader builds R2_PUBLIC_BASE_URL +
-- '/' + key at request time, so moving off the r2.dev domain is one env var and
-- zero row migrations.
--
-- TIMES ARE INTEGER MILLISECONDS. the manifest uses float seconds (sync.start);
-- convert at the boundary and keep floats out of the database.

-- ---------------------------------------------------------------- comics
create table if not exists comics (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  -- denormalized at insert so "by <name>" needs no profiles table and no join.
  -- goes stale if they rename; a profiles table is the fix when someone needs a
  -- page of their own (P-2), not before.
  owner_name    text not null,
  title         text not null,
  slug          text not null unique,
  direction     text not null default 'ltr' check (direction in ('ltr','rtl')),
  cover_key     text,
  series_title  text,
  series_index  int,
  status        text not null default 'draft' check (status in ('draft','published')),
  -- D6, two modes not three. 'allowlist' is a check-constraint change away if
  -- an author ever asks for it. default open: the point is to get people in.
  voice_consent text not null default 'open'  check (voice_consent in ('closed','open')),
  music_consent text not null default 'open'  check (music_consent in ('closed','open')),
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

-- ----------------------------------------------------------------- pages
-- D2: a published base is immutable. errata swap image_key in place, keeping
-- the row, the idx and the page count identical.
create table if not exists pages (
  id        uuid primary key default gen_random_uuid(),
  comic_id  uuid not null references comics(id) on delete cascade,
  idx       int  not null,
  image_key text not null,
  unique (comic_id, idx)
);

-- ---------------------------------------------------------------- tracks
-- the manifest's track list, flattened. music and silence own page ranges by
-- from_page; oneshots are triggered by the reader and own nothing.
create table if not exists tracks (
  id         uuid primary key default gen_random_uuid(),
  comic_id   uuid not null references comics(id) on delete cascade,
  order_idx  int  not null,               -- manifest order: decides queue order
  type       text not null check (type in ('music','silence','oneshot')),
  audio_key  text,                        -- null exactly when type = 'silence'
  title      text,
  from_page  int  not null,               -- sync.from, 1-based
  start_ms   int  not null default 0,     -- sync.start, the in point
  end_ms     int,                         -- sync.end, null = play to the end
  volume     int  not null default 100 check (volume between 0 and 100),
  gain_db    real not null default 0,     -- loudness normalization, 14.7
  duck       text,                        -- per-oneshot override of player.duck
  attach_to  uuid references tracks(id) on delete set null,   -- chains, 15.2
  offset_ms  int  not null default 0,     -- offset from the parent's start
  role       text,
  -- a oneshot is deliberately free either way: with audio it is a recorded
  -- line, without one it is an authored SLOT waiting for a voice actor, which
  -- is exactly how the studio already models it (cState.tracks[].aud is
  -- nullable). music must have audio; silence must not.
  constraint music_needs_audio    check (type <> 'music'   or audio_key is not null),
  constraint silence_has_no_audio check (type <> 'silence' or audio_key is null)
);

-- ----------------------------------------------------------------- kudos
-- AO3 model: one per account, no removal. the missing delete policy IS the
-- "no removal" rule, enforced by the database rather than by the ui.
create table if not exists kudos (
  comic_id   uuid not null references comics(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comic_id, user_id)
);

-- ----------------------------------------------------------------- views
-- D8 defers payouts but attribution history cannot be backfilled, so the insert
-- starts on day one. view_contributors is not needed yet: the only contributor
-- is comics.owner_id, which is already recorded.
create table if not exists views (
  id         bigserial primary key,
  comic_id   uuid not null references comics(id) on delete cascade,
  viewer_id  uuid references auth.users(id) on delete set null,  -- null = signed out
  session_id text,
  started_at timestamptz not null default now(),
  pages_read int  not null default 0,
  completed  boolean not null default false
);

-- --------------------------------------------------------------- reports
-- D5: the owner is the sole moderator, so the table IS the queue. read it in
-- the supabase table editor; no select policy means only the service role can.
create table if not exists reports (
  id          bigserial primary key,
  target_type text not null check (target_type in ('comic')),
  target_id   uuid not null,
  reporter_id uuid references auth.users(id) on delete set null,
  reason      text not null,
  status      text not null default 'open' check (status in ('open','closed')),
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- indexes
create index if not exists comics_shelf_idx on comics (status, created_at desc);
create index if not exists tracks_comic_idx on tracks (comic_id, order_idx);
create index if not exists views_comic_idx  on views  (comic_id);

-- ------------------------------------------------------------------- rls
-- consent and ownership are enforced HERE, at the query layer, not in app code.
-- a client-side mode flag is a hint; these policies are the actual rule.
alter table comics  enable row level security;
alter table pages   enable row level security;
alter table tracks  enable row level security;
alter table kudos   enable row level security;
alter table views   enable row level security;
alter table reports enable row level security;

-- comics: the world sees published ones, you see your own drafts too
drop policy if exists comics_read on comics;
create policy comics_read on comics for select
  using (status = 'published' or owner_id = auth.uid());

drop policy if exists comics_write on comics;
create policy comics_write on comics for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- pages and tracks inherit their comic's visibility exactly
drop policy if exists pages_read on pages;
create policy pages_read on pages for select using (
  exists (select 1 from comics c where c.id = pages.comic_id
          and (c.status = 'published' or c.owner_id = auth.uid())));

drop policy if exists pages_write on pages;
create policy pages_write on pages for all
  using      (exists (select 1 from comics c where c.id = pages.comic_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from comics c where c.id = pages.comic_id and c.owner_id = auth.uid()));

drop policy if exists tracks_read on tracks;
create policy tracks_read on tracks for select using (
  exists (select 1 from comics c where c.id = tracks.comic_id
          and (c.status = 'published' or c.owner_id = auth.uid())));

drop policy if exists tracks_write on tracks;
create policy tracks_write on tracks for all
  using      (exists (select 1 from comics c where c.id = tracks.comic_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from comics c where c.id = tracks.comic_id and c.owner_id = auth.uid()));

-- kudos: counts are public, you may only add your own, nobody may remove one
drop policy if exists kudos_read on kudos;
create policy kudos_read on kudos for select using (true);

drop policy if exists kudos_add on kudos;
create policy kudos_add on kudos for insert with check (user_id = auth.uid());

-- views: anyone may log one (signed out readers count), only the author reads them
drop policy if exists views_log on views;
create policy views_log on views for insert with check (true);

drop policy if exists views_read on views;
create policy views_read on views for select using (
  exists (select 1 from comics c where c.id = views.comic_id and c.owner_id = auth.uid()));

-- reports: signed-in users may file, only the service role may read
drop policy if exists reports_file on reports;
create policy reports_file on reports for insert with check (reporter_id = auth.uid());

-- supabase already grants these roles by default; explicit so a fresh project
-- cannot fail with a bare "permission denied" that looks like an rls problem.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ============================================================ phase 2, later
-- every one of these is additive; none rewrites a row:
--   alter table pages   add column note text            -- author direction, 15.3
--   create table slots (...)                            -- author-marked runs of speech
--   create table parts (id, comic_id, owner_id, kind 'vo'|'soundtrack', ...)
--   alter table tracks  add column part_id uuid references parts(id)
--   create table part_kudos (part_id, user_id)          -- kudos a VO; the comics
--                                                       -- kudos pk cannot absorb it
--   alter table views   add column mix_id uuid           -- once mixes exist
--   alter table reports drop constraint reports_target_type_check,
--     add check (target_type in ('comic','vo','soundtrack'))
-- and the tracks policies widen from "owns the comic" to "owns the comic OR
-- owns the part, and the comic's consent axis is open".
