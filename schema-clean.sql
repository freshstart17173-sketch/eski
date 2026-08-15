-- eski, the clean-slate schema for the all-purpose pivot.
-- Applied to project zidqagrmxeawpasurpwi 2026-08-15 as three migrations
-- (clean_slate_pivot, clean_slate_fixups, clean_slate_fixups_2), collapsed
-- here into one idempotent file — this is the copy that lives in the repo,
-- same convention as every other schema*.sql. Safe to re-run.
--
-- WHAT THIS REPLACED: the entire comics-era model — comics, pages, tracks,
-- parts, kudos, views, comic_tags, saves, the old comic-shaped comments, and
-- the RPCs that only made sense for them (get_comic). Owner's call: no users
-- beyond the owner's own three accounts, nothing worth migrating, so this
-- skips the cautious comics/works duality the schema-pivot.sql draft
-- proposed and just replaces the model outright. If you are looking for that
-- draft or for schema.sql/schema-parts.sql/schema-social.sql/
-- schema-comments.sql/schema-states.sql/schema-thumbs.sql/schema-sfx.sql/
-- schema-admin.sql/schema-profiles.sql, they are gone — this file and the
-- ones listed below are what is actually live now.
--
-- WHAT STAYS, UNTOUCHED, AND HAS ITS OWN FILE: admins/is_admin()
-- (schema-admin.sql's core survives inside this file instead, see §11 — the
-- old file's per-table policies were rewritten here), upload_quota/
-- claim_upload_quota (schema-quota.sql), artboard_items + the artboard
-- bucket (schema-artboard.sql, a separate internal review tool). Untouched
-- and undocumented anywhere until now: user_prefs, rate_events,
-- tag_synonyms/canonical_tag(), claim_rate()/claim_rate_sweep()/rate_limit()
-- (comment and report rate limiting off rate_events), account_live(),
-- touch_updated_at(), rls_auto_enable() (an event trigger that turns RLS on
-- for every new public table automatically). These predate this file and
-- were applied through a different checkout; nothing here alters them except
-- profiles_tombstone() and delete_my_account(), fixed below because they
-- referenced tables this file drops.
--
-- ONE MODEL, FIVE LEAF KINDS: a work is audio, video, image, text, or other,
-- or a combination of several authored as one unit (kind='combination',
-- children in work_items).
--
-- "COLLECTION" MEANS TWO THINGS, NOT ONE TABLE. The upload flow's "post
-- these as a collection" writes kind='combination' + work_items: one
-- author, one publish, ordered children. The `collections` table below is
-- the profile's "create a collection" feature: a curated shelf of already-
-- published works assembled after the fact, that need not all belong to the
-- curator. Keep the two "+ collection" entry points pointed at the right one.

-- ================================================================ 1. works
create table if not exists works (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  owner_name    text not null,
  kind          text not null check (kind in ('audio','video','image','text','other','combination')),
  title         text not null,
  slug          text not null unique,
  description   text,
  caption       text,
  body          text,
  media_key     text,
  cover_key     text,
  thumb_key     text,
  duration_ms   int,
  status        text not null default 'draft' check (status in ('draft','published','private')),
  version_of    uuid references works(id) on delete cascade,
  version_label text,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint works_no_self_version check (version_of is null or version_of <> id)
);

create index if not exists works_shelf_idx   on works (status, created_at desc);
create index if not exists works_owner_idx   on works (owner_id);
create index if not exists works_version_idx on works (version_of);

-- PUBLISHING IS ONE WAY, same rule comics had: a published post can go
-- private, never back to draft, because other people may already have
-- commented, liked, or built a collection around it. Shared by works and
-- collections below.
create or replace function post_status_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'cannot go back to draft once published; make it private instead'
      using errcode = '23514';
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists works_status on works;
create trigger works_status before update on works
  for each row execute function post_status_guard();

-- ONLY THE ORIGINAL POSTER MAY ADD A VERSION. works_write below already
-- requires owner_id = auth.uid() on the new row; without this a user could
-- still point version_of at someone ELSE's work while owning the new row,
-- which would read as "a version of their work" on a post that isn't theirs.
create or replace function works_version_owner_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.version_of is not null and not exists (
    select 1 from works v where v.id = new.version_of and v.owner_id = new.owner_id
  ) then
    raise exception 'a version may only be added to your own work' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists works_version_owner on works;
create trigger works_version_owner before insert or update on works
  for each row execute function works_version_owner_guard();

alter table works enable row level security;
drop policy if exists works_read on works;
create policy works_read on works for select
  using (status = 'published' or owner_id = auth.uid());
drop policy if exists works_write on works;
create policy works_write on works for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ========================================================== 2. work_items
create table if not exists work_items (
  id        uuid primary key default gen_random_uuid(),
  work_id   uuid not null references works(id) on delete cascade,
  idx       int  not null,
  kind      text not null check (kind in ('audio','video','image','text','other')),
  media_key text,
  caption   text,
  unique (work_id, idx),
  constraint work_items_media_required check (kind = 'text' or media_key is not null)
);
create index if not exists work_items_work_idx on work_items (work_id, idx);

alter table work_items enable row level security;
drop policy if exists work_items_read on work_items;
create policy work_items_read on work_items for select using (
  exists (select 1 from works w where w.id = work_items.work_id
          and (w.status = 'published' or w.owner_id = auth.uid())));
drop policy if exists work_items_write on work_items;
create policy work_items_write on work_items for all
  using      (exists (select 1 from works w where w.id = work_items.work_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from works w where w.id = work_items.work_id and w.owner_id = auth.uid()));

-- ========================================================= 3. collections
create table if not exists collections (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  owner_name  text not null,
  title       text not null,
  slug        text not null unique,
  description text,
  cover_key   text,
  status      text not null default 'draft' check (status in ('draft','published','private')),
  created_at  timestamptz not null default now(),
  published_at timestamptz
);

drop trigger if exists collections_status on collections;
create trigger collections_status before update on collections
  for each row execute function post_status_guard();

alter table collections enable row level security;
drop policy if exists collections_read on collections;
create policy collections_read on collections for select
  using (status = 'published' or owner_id = auth.uid());
drop policy if exists collections_write on collections;
create policy collections_write on collections for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists collection_items (
  collection_id uuid not null references collections(id) on delete cascade,
  work_id       uuid not null references works(id) on delete cascade,
  idx           int  not null default 0,
  added_at      timestamptz not null default now(),
  primary key (collection_id, work_id)
);
create index if not exists collection_items_idx on collection_items (collection_id, idx);

alter table collection_items enable row level security;
-- you may only curate your own collection, and only ADD a work that is
-- visible to you on its own terms — never someone else's draft.
drop policy if exists collection_items_read on collection_items;
create policy collection_items_read on collection_items for select using (
  exists (select 1 from collections c where c.id = collection_items.collection_id
          and (c.status = 'published' or c.owner_id = auth.uid())));
drop policy if exists collection_items_write on collection_items;
create policy collection_items_write on collection_items for all
  using (
    exists (select 1 from collections c where c.id = collection_items.collection_id and c.owner_id = auth.uid()))
  with check (
    exists (select 1 from collections c where c.id = collection_items.collection_id and c.owner_id = auth.uid())
    and exists (select 1 from works w where w.id = collection_items.work_id
                and (w.status = 'published' or w.owner_id = auth.uid())));

-- ========================================================= 4. content_tags
-- freeform, user-typed, editable by the poster any time and by anyone who
-- comments (added_by tracks who). Same ao3 dedup-by-primary-key model the
-- old comic_tags used.
create table if not exists content_tags (
  target_type text not null check (target_type in ('work','collection')),
  target_id   uuid not null,
  tag         text not null check (tag = lower(btrim(tag)) and char_length(tag) between 2 and 40),
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, tag)
);
create index if not exists content_tags_tag_idx    on content_tags (tag);
create index if not exists content_tags_target_idx on content_tags (target_type, target_id);

alter table content_tags enable row level security;
drop policy if exists content_tags_read on content_tags;
create policy content_tags_read on content_tags for select using (
  case target_type
    when 'work'       then exists (select 1 from works w where w.id = content_tags.target_id
                                     and (w.status = 'published' or w.owner_id = auth.uid()))
    when 'collection' then exists (select 1 from collections c where c.id = content_tags.target_id
                                     and (c.status = 'published' or c.owner_id = auth.uid()))
    else false
  end);
drop policy if exists content_tags_add on content_tags;
create policy content_tags_add on content_tags for insert with check (
  added_by = auth.uid() and case target_type
    when 'work'       then exists (select 1 from works w where w.id = content_tags.target_id and w.status = 'published')
    when 'collection' then exists (select 1 from collections c where c.id = content_tags.target_id and c.status = 'published')
    else false
  end);
drop policy if exists content_tags_remove on content_tags;
create policy content_tags_remove on content_tags for delete using (
  added_by = auth.uid() or case target_type
    when 'work'       then exists (select 1 from works w where w.id = content_tags.target_id and w.owner_id = auth.uid())
    when 'collection' then exists (select 1 from collections c where c.id = content_tags.target_id and c.owner_id = auth.uid())
    else false
  end);

-- ============================================================ 5. comments
-- one clean generalized shape from day one. Same three rules the old
-- comic-shaped comments table enforced: one level of reply, a delete is a
-- tombstone (replies survive), the byline is server-filled. mark_type
-- exists but is unused today — the !/?/!! criticism system is designed, not
-- built. A plain comment has mark_type null. comments_rate_guard (below,
-- pre-existing) gates posting at 30/hour via rate_events.
create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  target_type   text not null check (target_type in ('work','collection')),
  target_id     uuid not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  parent_id     uuid references comments(id) on delete cascade,
  body          text,
  mark_type     text check (mark_type is null or mark_type in ('positive','negative','collab')),
  author_name   text not null,
  author_handle text,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  deleted_at    timestamptz,
  constraint comments_not_empty check (
    deleted_at is not null
    or (body is not null and length(btrim(body)) > 0)
    or mark_type is not null),
  constraint comments_body_len check (body is null or length(body) <= 2000)
);
create index if not exists comments_target_idx on comments (target_type, target_id, created_at);
create index if not exists comments_parent_idx on comments (parent_id) where parent_id is not null;
create index if not exists comments_marks_idx  on comments (target_type, target_id, mark_type) where mark_type is not null;

create or replace function comments_depth_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from comments p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'a reply cannot be replied to' using errcode = '23514';
    end if;
    if not exists (select 1 from comments p where p.id = new.parent_id
                   and p.target_type = new.target_type and p.target_id = new.target_id) then
      raise exception 'a reply must be on the same post' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comments_depth on comments;
create trigger comments_depth before insert or update on comments
  for each row execute function comments_depth_guard();

create or replace function comments_author()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare p record; u record;
begin
  select display_name, handle into p from profiles where id = new.user_id;
  select raw_user_meta_data as meta, email into u from auth.users where id = new.user_id;
  new.author_handle := p.handle;
  new.author_name := coalesce(
    nullif(btrim(p.display_name), ''), nullif(btrim(p.handle), ''),
    nullif(btrim(u.meta ->> 'full_name'), ''), nullif(btrim(u.meta ->> 'name'), ''),
    nullif(btrim(u.meta ->> 'user_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'someone');
  return new;
end $$;
drop trigger if exists comments_author_fill on comments;
create trigger comments_author_fill before insert on comments
  for each row execute function comments_author();

create or replace function comments_tombstone()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := null; new.mark_type := null;
    return new;
  end if;
  if new.user_id <> auth.uid() then
    raise exception 'a comment may only be edited by the person who wrote it' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
drop trigger if exists comments_tomb on comments;
create trigger comments_tomb before update on comments
  for each row execute function comments_tombstone();

-- comments_rate_guard and rate_events/claim_rate/rate_limit predate this
-- file (applied through a different checkout, undocumented until now) —
-- re-attached here because dropping the old comments table cascaded away
-- whatever trigger used to call it.
drop trigger if exists comments_rate_limit on comments;
create trigger comments_rate_limit before insert on comments
  for each row execute function comments_rate_guard();

alter table comments enable row level security;
drop policy if exists comments_read on comments;
create policy comments_read on comments for select using (
  case target_type
    when 'work'       then exists (select 1 from works w where w.id = comments.target_id
                                     and (w.status = 'published' or w.owner_id = auth.uid()))
    when 'collection' then exists (select 1 from collections c where c.id = comments.target_id
                                     and (c.status = 'published' or c.owner_id = auth.uid()))
    else false
  end);
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert with check (
  user_id = auth.uid() and deleted_at is null and case target_type
    when 'work'       then exists (select 1 from works w where w.id = comments.target_id and w.status = 'published')
    when 'collection' then exists (select 1 from collections c where c.id = comments.target_id and c.status = 'published')
    else false
  end);
-- an author edits their own; the post's owner may tombstone anything on it
drop policy if exists comments_update on comments;
create policy comments_update on comments for update
  using (
    deleted_at is null and (
      user_id = auth.uid() or case target_type
        when 'work'       then exists (select 1 from works w where w.id = comments.target_id and w.owner_id = auth.uid())
        when 'collection' then exists (select 1 from collections c where c.id = comments.target_id and c.owner_id = auth.uid())
        else false
      end))
  with check (
    user_id = auth.uid() or case target_type
      when 'work'       then exists (select 1 from works w where w.id = comments.target_id and w.owner_id = auth.uid())
      when 'collection' then exists (select 1 from collections c where c.id = comments.target_id and c.owner_id = auth.uid())
      else false
    end);
drop policy if exists comments_delete on comments;
create policy comments_delete on comments for delete using (
  user_id = auth.uid() or case target_type
    when 'work'       then exists (select 1 from works w where w.id = comments.target_id and w.owner_id = auth.uid())
    when 'collection' then exists (select 1 from collections c where c.id = comments.target_id and c.owner_id = auth.uid())
    else false
  end);

-- =============================================================== 6. likes
-- the ruby-red Like button in the mockups. Separate from the !/?/!!
-- criticism marks designed in comments above — those replace or absorb this
-- later if they ship; for now a like is the only reaction that exists.
create table if not exists likes (
  target_type text not null check (target_type in ('work','collection')),
  target_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, user_id)
);
create index if not exists likes_target_idx on likes (target_type, target_id);

alter table likes enable row level security;
drop policy if exists likes_read on likes;
create policy likes_read on likes for select using (true);
drop policy if exists likes_add on likes;
create policy likes_add on likes for insert with check (user_id = auth.uid());
drop policy if exists likes_remove on likes;
create policy likes_remove on likes for delete using (user_id = auth.uid());

-- ======================================================= 7. save folders
-- PRIVATE personal bookmarking, Pinterest-board style — distinct from the
-- public `collections` above. "Save" in the ui opens a dropdown of these.
create table if not exists save_folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
alter table save_folders enable row level security;
drop policy if exists save_folders_owner on save_folders;
create policy save_folders_owner on save_folders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists save_folder_items (
  folder_id   uuid not null references save_folders(id) on delete cascade,
  target_type text not null check (target_type in ('work','collection')),
  target_id   uuid not null,
  added_at    timestamptz not null default now(),
  primary key (folder_id, target_type, target_id)
);
alter table save_folder_items enable row level security;
drop policy if exists save_folder_items_owner on save_folder_items;
create policy save_folder_items_owner on save_folder_items for all
  using (exists (select 1 from save_folders f where f.id = save_folder_items.folder_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from save_folders f where f.id = save_folder_items.folder_id and f.owner_id = auth.uid()));

-- ============================================================ 8. seen marks
-- backs the seen/unseen modifier filter. upserted when a detail overlay
-- opens; one row per (user, post), no history.
create table if not exists seen_marks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('work','collection')),
  target_id   uuid not null,
  seen_at     timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
alter table seen_marks enable row level security;
drop policy if exists seen_marks_owner on seen_marks;
create policy seen_marks_owner on seen_marks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================== 9. reports
-- the owner is the sole moderator; the table is the queue. file_report()
-- (predates this file) wraps the insert and is fixed below to point at
-- work/collection instead of the old comic/part.
create table if not exists reports (
  id             bigserial primary key,
  target_type    text not null check (target_type in ('work','collection','comment','profile')),
  target_id      uuid not null,
  reporter_id    uuid references auth.users(id) on delete set null,
  reason         text not null,
  category       text not null default 'other'
                 check (category in ('csam','harassment','copyright','spam','impersonation','other')),
  status         text not null default 'open' check (status in ('open','reviewing','actioned','closed')),
  moderator_note text,
  resolved_by    uuid references auth.users(id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
-- category sorts CSAM to the top of any query ordering by it. That category
-- is a legal reporting obligation (18 U.S.C. 2258A, NCMEC CyberTipline), not
-- just a severity label.
create index if not exists reports_queue_idx on reports (status, category, created_at);

alter table reports enable row level security;
drop policy if exists reports_file on reports;
create policy reports_file on reports for insert with check (reporter_id = auth.uid());

create or replace function file_report(p_type text, p_id uuid, p_reason text)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gate json;
  exists_ok boolean;
begin
  if uid is null then
    return json_build_object('ok', false, 'why', 'not signed in');
  end if;
  if p_type not in ('work','collection','comment','profile') then
    return json_build_object('ok', false, 'why', 'unknown target');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    return json_build_object('ok', false, 'why', 'a reason is required');
  end if;
  if char_length(p_reason) > 2000 then
    return json_build_object('ok', false, 'why', 'reason too long');
  end if;

  execute format(
    'select exists (select 1 from %I where id = $1)',
    case p_type when 'work'    then 'works'
                when 'collection' then 'collections'
                when 'comment' then 'comments'
                else                'profiles' end)
    into exists_ok using p_id;

  if not exists_ok then
    return json_build_object('ok', false, 'why', 'that no longer exists');
  end if;

  if exists (select 1 from reports r
              where r.reporter_id = uid and r.target_type = p_type
                and r.target_id = p_id and r.status = 'open') then
    return json_build_object('ok', true, 'already', true);
  end if;

  gate := claim_rate('report');
  if not (gate->>'ok')::boolean then return gate; end if;

  insert into reports (target_type, target_id, reporter_id, reason)
  values (p_type, p_id, uid, btrim(p_reason));

  if random() < 0.02 then perform claim_rate_sweep(); end if;

  return json_build_object('ok', true);
end $$;

-- =========================================================== 10. moderation
alter table profiles add column if not exists is_suspended boolean not null default false;
alter table profiles add column if not exists suspended_at timestamptz;
alter table profiles add column if not exists strike_count int not null default 0;

-- ================================================== 11. admin console reach
-- is_admin()/admins predate this file and are untouched; these are the
-- per-table policies that used to be attached to comics/comments/parts/
-- reports (formerly schema-admin.sql), rewritten against the new tables.
drop policy if exists works_admin_read on works;
create policy works_admin_read on works for select using (is_admin());
drop policy if exists works_admin_write on works;
create policy works_admin_write on works for update using (is_admin()) with check (is_admin());
drop policy if exists works_admin_delete on works;
create policy works_admin_delete on works for delete using (is_admin());

drop policy if exists collections_admin_read on collections;
create policy collections_admin_read on collections for select using (is_admin());
drop policy if exists collections_admin_write on collections;
create policy collections_admin_write on collections for update using (is_admin()) with check (is_admin());
drop policy if exists collections_admin_delete on collections;
create policy collections_admin_delete on collections for delete using (is_admin());

drop policy if exists comments_admin_read on comments;
create policy comments_admin_read on comments for select using (is_admin());
drop policy if exists comments_admin_write on comments;
create policy comments_admin_write on comments for update using (is_admin()) with check (is_admin());
drop policy if exists comments_admin_delete on comments;
create policy comments_admin_delete on comments for delete using (is_admin());

drop policy if exists reports_admin_read on reports;
create policy reports_admin_read on reports for select using (is_admin());
drop policy if exists reports_admin_write on reports;
create policy reports_admin_write on reports for update using (is_admin()) with check (is_admin());

-- ============================================================== 12. follows
-- generic (follower_id/followee_id only, no comics dependency) — restored
-- after being dropped by mistake in the first pass of this migration. Backs
-- the following/not-following modifier-tag filter.
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

-- ===================================================== 13. account deletion
-- profiles_tombstone (predates this file, still live on profiles) wrote
-- "Deleted account" into comics.owner_name; repointed at works/collections.
-- delete_my_account referenced comics and the old single-status saves
-- table; repointed at works/collections drafts and save_folders
-- (save_folder_items cascades off save_folders, so deleting the folders is
-- enough).
create or replace function profiles_tombstone()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.display_name := null;
    new.bio          := null;
    new.avatar_url   := null;
    update works       set owner_name  = 'Deleted account' where owner_id = new.id;
    update collections set owner_name  = 'Deleted account' where owner_id = new.id;
    update comments    set author_name = 'Deleted account' where user_id  = new.id;
    return new;
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'a deleted account cannot be restored' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function delete_my_account()
returns json language plpgsql set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return json_build_object('ok', false, 'why', 'not signed in');
  end if;
  update profiles set deleted_at = now() where id = uid and deleted_at is null;
  if not found then
    return json_build_object('ok', true, 'already', true);
  end if;
  delete from works        where owner_id = uid and status = 'draft';
  delete from collections  where owner_id = uid and status = 'draft';
  delete from save_folders where owner_id = uid;
  delete from follows      where follower_id = uid;
  delete from upload_quota where user_id = uid;
  delete from user_prefs   where user_id = uid;
  return json_build_object('ok', true);
end $$;

-- ===================================================================== grants
grant select, insert, update, delete on works, work_items, collections, collection_items,
  content_tags, comments, likes, save_folders, save_folder_items, seen_marks, reports, follows
  to authenticated;
grant select on works, work_items, collections, collection_items, content_tags, comments, likes, follows
  to anon;
grant usage, select on all sequences in schema public to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('works','work_items','collections','collection_items','content_tags',
                      'comments','likes','save_folders','save_folder_items','seen_marks',
                      'reports','follows')
order by table_name;
