-- eski, cover thumbnails. paste into the supabase sql editor and run. safe to
-- re-run, and safe to run on a project that already has the column.
--
-- WHY A SEPARATE FILE: thumb_key was added to schema-profiles.sql after that
-- file had already been applied, so a project set up before then has every
-- other column and not this one. publish writes thumb_key on every comic, so
-- the missing column fails the insert outright:
--
--   ESK-5001 could not write the comic row: ... [PGRST204]
--   ESK-5001 could not write the comic row: ... [42703]
--
-- Both mean the same thing here. This file is the fix. Re-running
-- schema-profiles.sql does exactly the same work; this exists so you do not
-- have to re-read a longer file to find one line.

-- a small generated cover thumbnail (about 400px wide, webp), content
-- addressed like every other object. null means fall back to cover_key, which
-- is what every comic published before this column has.
alter table comics add column if not exists thumb_key text;

-- the modal shows a description; older projects may predate this one too.
alter table comics add column if not exists description text;

-- postgrest caches the table shapes, and an alter does not always reach it
-- immediately. this makes the new column visible without waiting.
notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
-- should return two rows, description and thumb_key.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'comics'
  and column_name in ('description', 'thumb_key')
order by column_name;
