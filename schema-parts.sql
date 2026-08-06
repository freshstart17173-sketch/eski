-- eski, parts. run after schema.sql and schema-profiles.sql. safe to re-run.
--
-- WHAT A PART IS: a voice track or a soundtrack that somebody who is NOT the
-- author made for an existing comic. It is the second contributor arriving,
-- which is the entire point of the project, and until now the only way to ship
-- one was to export a file and hand it over by discord.
--
-- WHY THIS SHAPE AND NOT 14.5's: the full design has vos, vo_clips,
-- soundtracks, soundtrack_tracks, soundtrack_cues and mixes as six tables. The
-- tracks table already models every one of those rows; what it lacked was an
-- owner. So a part is a header, and tracks grows two columns. Nothing here
-- blocks the fuller shape later: vos and soundtracks can be views over parts,
-- and mixes can be added on top without rewriting a row.
--
-- CONSENT IS ENFORCED HERE, not in the studio. A mode flag in the browser is a
-- hint; the policy below is the rule, and it is checked on every insert.

-- ------------------------------------------------------------------- parts
create table if not exists parts (
  id            uuid primary key default gen_random_uuid(),
  comic_id      uuid not null references comics(id)     on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  -- denormalized for the same reason comics.owner_name is: "voiced by <name>"
  -- must not need a join, and the byline is a snapshot of who shipped it
  owner_name    text not null,
  kind          text not null check (kind in ('vo','soundtrack')),
  title         text,
  -- a vo covers exactly one character (studio already refuses more than one).
  -- the key matches the base manifest's cast key. null on a soundtrack.
  character_key text,
  status        text not null default 'draft' check (status in ('draft','published')),
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint vo_names_a_character
    check (kind <> 'vo' or character_key is not null)
);

-- ------------------------------------------------------- tracks belongs-to
-- a track with part_id null is the author's, exactly as before. this is why the
-- column is nullable and why nothing needs backfilling.
alter table tracks add column if not exists part_id uuid references parts(id) on delete cascade;

-- filling an authored SLOT: the base carries a oneshot with no audio, and a vo
-- supplies the recording. the part's row points at the slot it fills, and the
-- reader swaps it in. this is the database mirror of mergePart()'s "a track
-- with an id the base already has replaces it".
alter table tracks add column if not exists fills uuid references tracks(id) on delete cascade;

do $$ begin
  alter table tracks add constraint fills_needs_a_part
    check (fills is null or part_id is not null);
exception when duplicate_object then null; end $$;

-- WHICH CHARACTER A LINE BELONGS TO. the file manifest has carried this since
-- one-shots shipped; the database dropped it, so a voice actor opening a comic
-- from the library saw slots with no idea who speaks them. it is the same cast
-- key the manifest uses.
alter table tracks add column if not exists character_key text;

-- and the cast itself, so those keys have names. a jsonb column rather than a
-- cast_members table: it is authored as one list, read as one list, and never
-- queried across comics. the table in 14.5 is still the right shape the day
-- somebody needs to ask "what has this character appeared in".
-- (the column cannot be called "cast": CAST is reserved in sql.)
alter table comics add column if not exists cast_list jsonb;

create index if not exists parts_comic_idx  on parts  (comic_id, kind, status);
create index if not exists parts_owner_idx  on parts  (owner_id);
create index if not exists tracks_part_idx  on tracks (part_id);

-- ------------------------------------------------------- the consent gate
-- D6's two axes. voice consent governs a vo, music consent a soundtrack, and a
-- closed axis means the insert never happens rather than the ui hiding a button.
create or replace function eski_part_allowed(cid uuid, k text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from comics c
    where c.id = cid
      and case when k = 'vo' then c.voice_consent else c.music_consent end = 'open'
  );
$$;

-- ------------------------------------------------------------------- rls
alter table parts enable row level security;

-- a published part is public; your own drafts are yours alone
drop policy if exists parts_read on parts;
create policy parts_read on parts for select using (
  (status = 'published' or owner_id = auth.uid())
  and exists (select 1 from comics c where c.id = parts.comic_id
              and (c.status = 'published' or c.owner_id = auth.uid())));

-- you may only create your own, and only where the author left the axis open
drop policy if exists parts_insert on parts;
create policy parts_insert on parts for insert
  with check (owner_id = auth.uid() and eski_part_allowed(comic_id, kind));

-- editing and withdrawing your own part stays possible even if the author
-- later closes the axis: consent gates NEW work, it does not seize existing
-- work, and someone must always be able to take their own voice down.
drop policy if exists parts_update on parts;
create policy parts_update on parts for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists parts_delete on parts;
create policy parts_delete on parts for delete using (owner_id = auth.uid());

-- tracks: the author owns the base's rows, a contributor owns their part's
drop policy if exists tracks_read on tracks;
create policy tracks_read on tracks for select using (
  exists (select 1 from comics c where c.id = tracks.comic_id
          and (c.status = 'published' or c.owner_id = auth.uid()))
  and (part_id is null
       or exists (select 1 from parts p where p.id = tracks.part_id
                  and (p.status = 'published' or p.owner_id = auth.uid()))));

drop policy if exists tracks_write on tracks;
create policy tracks_write on tracks for all
  using (
    case when part_id is null
      then exists (select 1 from comics c where c.id = tracks.comic_id and c.owner_id = auth.uid())
      else exists (select 1 from parts  p where p.id = tracks.part_id  and p.owner_id = auth.uid())
    end)
  with check (
    case when part_id is null
      then exists (select 1 from comics c where c.id = tracks.comic_id and c.owner_id = auth.uid())
      else exists (select 1 from parts  p where p.id = tracks.part_id  and p.owner_id = auth.uid()
                   and eski_part_allowed(p.comic_id, p.kind))
    end);

grant select, insert, update, delete on parts to authenticated;
grant select on parts to anon;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
-- parts exists, and tracks knows about part_id and fills.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'tracks' and column_name in ('part_id','fills','character_key'))
    or (table_name = 'comics' and column_name = 'cast_list')
    or (table_name = 'parts'  and column_name = 'id'))
order by table_name, column_name;

-- ============================================================ phase 3, later
--   create table part_kudos (part_id, user_id, primary key (part_id, user_id))
--     -- the comics kudos pk cannot absorb it: you thank a performance, not
--     -- only a comic.
--   alter table parts add column preview_key text   -- 14.6, generated at ingest
--   alter table parts add column plays int          -- popularity, D5
--   alter table reports drop constraint reports_target_type_check,
--     add check (target_type in ('comic','vo','soundtrack'))
