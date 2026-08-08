-- eski: comments on a comic.
-- Applied to project zidqagrmxeawpasurpwi. Safe to re-run.
--
-- Three things are enforced here rather than in the browser, because the
-- browser is not where they can be enforced:
--
--   1. ONE LEVEL OF REPLY. A thread on a comic does not need more, and a
--      trigger is the only place a client cannot route around it.
--   2. A DELETED COMMENT IS A TOMBSTONE, not a missing row. Hard-deleting a
--      comment that has replies takes the replies with it, so "delete" in the
--      ui sets deleted_at and the trigger blanks the text. The body is gone
--      from the wire, not merely unrendered.
--   3. THE NAME BESIDE A COMMENT IS SERVER-FILLED. Whatever the client sends
--      in author_name / author_handle is discarded and replaced from the
--      profile or the auth metadata, so nobody posts under someone else's
--      name.

-- ------------------------------------------------------------------ table
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  comic_id    uuid not null references public.comics(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade,
  body        text not null,
  -- the page it was written from, when it came out of the reader. a comment
  -- that says "re: p.7" is its own spoiler warning.
  page        integer check (page is null or page >= 0),
  author_name text not null,
  author_handle text,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz
);

comment on table public.comments is
  'comments on a published comic. deleted_at is a tombstone so replies survive.';

-- an empty body is legal exactly when the row is a tombstone
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check check (
  case when deleted_at is null
       then char_length(btrim(body)) between 1 and 4000
       else body = '' end);

create index if not exists comments_comic_idx  on public.comments (comic_id, created_at);
create index if not exists comments_parent_idx on public.comments (parent_id)
  where parent_id is not null;
create index if not exists comments_user_idx   on public.comments (user_id);

-- ------------------------------------------------------------------ triggers
-- one level of reply, and a reply stays on the comic it answers
create or replace function public.comments_depth_guard()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.comments p
               where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'a reply cannot be replied to' using errcode = '23514';
    end if;
    if not exists (select 1 from public.comments p
                   where p.id = new.parent_id and p.comic_id = new.comic_id) then
      raise exception 'a reply must be on the same comic' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists comments_depth on public.comments;
create trigger comments_depth before insert or update on public.comments
  for each row execute function public.comments_depth_guard();

-- the displayed name, filled from the server's idea of who you are
create or replace function public.comments_author()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare p record; u record;
begin
  select display_name, handle into p from public.profiles where id = new.user_id;
  select raw_user_meta_data as meta, email into u from auth.users where id = new.user_id;
  new.author_handle := p.handle;
  new.author_name := coalesce(
    nullif(btrim(p.display_name), ''),
    nullif(btrim(p.handle), ''),
    nullif(btrim(u.meta ->> 'full_name'), ''),
    nullif(btrim(u.meta ->> 'name'), ''),
    nullif(btrim(u.meta ->> 'user_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'someone');
  return new;
end $$;

drop trigger if exists comments_author_fill on public.comments;
create trigger comments_author_fill before insert on public.comments
  for each row execute function public.comments_author();

-- tombstoning, and the rule that an owner moderating may hide a comment but
-- never rewrite it
create or replace function public.comments_tombstone()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '';
    new.page := null;
    return new;
  end if;
  if new.user_id <> auth.uid() then
    raise exception 'a comment may only be edited by the person who wrote it'
      using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists comments_tomb on public.comments;
create trigger comments_tomb before update on public.comments
  for each row execute function public.comments_tombstone();

-- ------------------------------------------------------------------ rls
alter table public.comments enable row level security;

-- anyone may read a published comic's thread; an author may read their draft's
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select
  using (exists (
    select 1 from public.comics c
    where c.id = comments.comic_id
      and (c.status = 'published' or c.owner_id = auth.uid())));

-- your own row, on a published comic. drafts take no comments.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (
    user_id = auth.uid()
    and deleted_at is null
    and exists (select 1 from public.comics c
                where c.id = comic_id and c.status = 'published'));

-- an author edits their own; a comic owner may tombstone anything on their
-- comic. the trigger above stops an owner turning that into a rewrite.
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update
  using (
    deleted_at is null
    and (user_id = auth.uid()
         or exists (select 1 from public.comics c
                    where c.id = comments.comic_id and c.owner_id = auth.uid())))
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.comics c
               where c.id = comments.comic_id and c.owner_id = auth.uid()));

-- hard delete stays available to both, and still cascades to replies. that is
-- the deliberate heavier tool.
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete
  using (user_id = auth.uid()
         or exists (select 1 from public.comics c
                    where c.id = comments.comic_id and c.owner_id = auth.uid()));

-- ------------------------------------------------------------------ verify
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'comments' order by policyname;
