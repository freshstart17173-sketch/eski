-- eski, tags + the shelf + follows. run after schema.sql, schema-profiles.sql
-- and schema-parts.sql. safe to re-run. ALREADY APPLIED to the live project as
-- migration `tags_shelf_follows`; this file is the copy that lives in the repo.
--
-- THREE THINGS THE FINAL DESIGN NEEDS AND THE DATABASE DID NOT HAVE:
--   1. tags. every card in docs/design/final/home.html carries five of them and
--      the browse surface searches on them. `comics` had no tags column at all.
--   2. the shelf. "read later", "reading" and "read" were three different
--      inventions in three different places (a localStorage list on home, a
--      dead "saved" tab on the profile, a per-title localStorage page number in
--      the reader). They are ONE row with a status.
--   3. follows, because home leads with "from people you follow".

-- ============================================================ tags
-- ao3 model: anyone signed in may tag a published comic, and the primary key
-- dedupes, so two people adding "horror" is one row and not a popularity
-- contest. lowercase is enforced here rather than in the browser because the
-- browser is a hint and the constraint is the rule.
create table if not exists comic_tags (
  comic_id   uuid not null references comics(id) on delete cascade,
  tag        text not null check (tag = lower(btrim(tag)) and char_length(tag) between 2 and 40),
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (comic_id, tag)
);
create index if not exists comic_tags_tag_idx on comic_tags (tag);

alter table comic_tags enable row level security;

drop policy if exists comic_tags_read on comic_tags;
create policy comic_tags_read on comic_tags for select using (
  exists (select 1 from comics c where c.id = comic_tags.comic_id
          and (c.status = 'published' or c.owner_id = auth.uid())));

drop policy if exists comic_tags_add on comic_tags;
create policy comic_tags_add on comic_tags for insert with check (
  added_by = auth.uid()
  and exists (select 1 from comics c where c.id = comic_tags.comic_id and c.status = 'published'));

-- you may pull a tag you added; the author may pull any tag on their comic
drop policy if exists comic_tags_remove on comic_tags;
create policy comic_tags_remove on comic_tags for delete using (
  added_by = auth.uid()
  or exists (select 1 from comics c where c.id = comic_tags.comic_id and c.owner_id = auth.uid()));

-- ======================================================= the shelf
-- read later, reading and read are ONE thing with a status, not three lists.
-- last_page/pages is what draws the progress bar on the profile, and the
-- reader upserts it as you turn pages.
create table if not exists saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  comic_id   uuid not null references comics(id) on delete cascade,
  status     text not null default 'later' check (status in ('later','reading','read')),
  last_page  int  not null default 0 check (last_page >= 0),
  pages      int  not null default 0 check (pages >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, comic_id)
);
create index if not exists saves_user_idx on saves (user_id, status);

alter table saves enable row level security;

-- A SHELF IS PUBLIC. profile.html?u=<handle> is a public address and the design
-- puts "reading" and "read" on it, so this table is world readable by
-- construction. do not put anything private in it.
drop policy if exists saves_read on saves;
create policy saves_read on saves for select using (true);

drop policy if exists saves_write on saves;
create policy saves_write on saves for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ========================================================== follows
create table if not exists follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on follows (followee_id);

alter table follows enable row level security;

drop policy if exists follows_read on follows;
create policy follows_read on follows for select using (true);

drop policy if exists follows_write on follows;
create policy follows_write on follows for all
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());

grant select, insert, update, delete on comic_tags, saves, follows to authenticated;
grant select on comic_tags, saves, follows to anon;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema = 'public' and table_name in ('comic_tags','saves','follows')
group by table_name order by table_name;
