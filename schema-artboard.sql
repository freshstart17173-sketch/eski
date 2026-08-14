-- eski, the artboard. ALREADY APPLIED to the live project directly via the
-- supabase MCP on 2026-08-15 (owner said "build and deploy, idc if prod
-- breaks rn") — this file is the copy that lives in the repo, same
-- convention as schema-social.sql's tags_shelf_follows migration. Safe to
-- re-run.
--
-- WHAT THIS IS: artboard.html is an internal review canvas — every live app
-- page and design exploration embedded as real iframes, with comment pins
-- and pasted reference images layered on top in free-floating world
-- coordinates. Not the site's actual comment system: eski already has a
-- real `comments` table (threaded, page-pinned to a comic) that this does
-- not touch or reuse. Two different shapes for two different jobs.
--
-- NOTE ON DRIFT: the live database was already ahead of every schema*.sql
-- file in this repo when this was written — comics.status has a 'private'
-- option, tracks carries loudness/positioning columns, parts has an 'sfx'
-- kind, profiles has shelf_public/deleted_at, reports already covers more
-- than 'comic', and admins/upload_quota/user_prefs/rate_events exist with
-- no matching file here at all. That gap is real and worth closing
-- separately — see ROADMAP.md — this file does not attempt to.

create table if not exists artboard_items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('comment','image')),
  x          double precision not null,
  y          double precision not null,
  w          double precision,          -- images only
  h          double precision,          -- images only
  body       text,                      -- comments only
  image_key  text,                      -- storage object path in the 'artboard' bucket, images only
  resolved   boolean not null default false,
  user_id    uuid references auth.users(id) on delete set null,
  owner_name text,
  created_at timestamptz not null default now(),
  constraint artboard_items_shape check (
    (kind = 'comment' and body is not null and length(btrim(body)) > 0)
    or (kind = 'image' and image_key is not null))
);
create index if not exists artboard_items_created_idx on artboard_items (created_at);

alter table artboard_items enable row level security;

-- public read (no auth gate on viewing the board — the url just isn't
-- linked from anywhere, same obscurity model as spec.html), write requires
-- sign-in and ownership. resolving someone else's comment is deliberately
-- not allowed yet: today the same one account both leaves and addresses
-- feedback, so owner-only edit is the simple, safe default. widen this if
-- a second person starts using the board.
drop policy if exists artboard_items_read on artboard_items;
create policy artboard_items_read on artboard_items for select using (true);

drop policy if exists artboard_items_add on artboard_items;
create policy artboard_items_add on artboard_items for insert with check (user_id = auth.uid());

drop policy if exists artboard_items_edit on artboard_items;
create policy artboard_items_edit on artboard_items for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists artboard_items_remove on artboard_items;
create policy artboard_items_remove on artboard_items for delete using (user_id = auth.uid());

grant select on artboard_items to anon;
grant select, insert, update, delete on artboard_items to authenticated;

-- storage: a public bucket for pasted reference images. distinct from the
-- existing 'files' (private) and 'avatars' (public) buckets.
insert into storage.buckets (id, name, public)
values ('artboard', 'artboard', true)
on conflict (id) do nothing;

drop policy if exists artboard_bucket_read on storage.objects;
create policy artboard_bucket_read on storage.objects for select
  using (bucket_id = 'artboard');

drop policy if exists artboard_bucket_insert on storage.objects;
create policy artboard_bucket_insert on storage.objects for insert
  with check (bucket_id = 'artboard' and auth.uid() is not null);

drop policy if exists artboard_bucket_delete on storage.objects;
create policy artboard_bucket_delete on storage.objects for delete
  using (bucket_id = 'artboard' and owner = auth.uid());

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'artboard_items'
union all
select id from storage.buckets where id = 'artboard';
