-- eski, per-account preferences. run any time; safe to re-run.
--
-- WHAT THIS FIXES. The theme lives in localStorage, which is per-browser. Pick
-- a theme on a laptop, open the site on a phone, and it is the default again —
-- the setting looks like it did not save. It saved; it saved somewhere the
-- phone cannot see.
--
-- WHY NOT A COLUMN ON profiles. `profiles_read` is `using (true)`, because a
-- byline nobody can open is not attribution. Anything added there is readable
-- by the whole internet, forever, and a preference is nobody's business but
-- the account's. More to the point: the NEXT preference somebody adds beside
-- it might be genuinely sensitive, and it would inherit that policy silently.
-- A table with its own owner-only policy is the shape that stays correct.
--
-- localStorage IS STILL THE SOURCE OF TRUTH FOR THE FIRST PAINT. palette.js is
-- a synchronous classic script in <head> precisely so the page never paints in
-- one theme and repaints in yours. A round trip cannot happen before paint, so
-- this table cannot be read first. It reconciles just after sign-in instead:
-- see palette.js `adopt`.

create table if not exists user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- '<treatment>-<hue>', e.g. 'mono-green'. TEXT, NOT AN ENUM: palette.js owns
  -- the list of themes and gains hues without a migration. An id this column
  -- does not recognise is rejected by parse() on the way in and falls back to
  -- the default, so a stale value is harmless rather than fatal.
  theme      text,
  updated_at timestamptz not null default now()
);

alter table user_prefs enable row level security;

-- yours and only yours, read and write. no public read: unlike a profile there
-- is nothing here anyone else has a reason to see.
drop policy if exists prefs_own on user_prefs;
create policy prefs_own on user_prefs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on user_prefs to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select 'table exists' as check,
       (select count(*)::text from information_schema.tables
         where table_name = 'user_prefs') as value
union all
select 'rls on',
       (select relrowsecurity::text from pg_class where relname = 'user_prefs')
union all
select 'anon cannot read it',
       (select count(*)::text from information_schema.role_table_grants
         where table_name = 'user_prefs' and grantee = 'anon');
