-- eski: a comic's three states, and what a profile shows a stranger.
-- Applied to project zidqagrmxeawpasurpwi. Safe to re-run.
--
-- PUBLISHING IS ONE WAY.
--
-- "Unpublish" used to send a comic back to 'draft', which put it back in the
-- studio's hands — so a voice actor or a composer could finish a part and find
-- the comic they contributed to had been re-cut underneath them. A draft is
-- now only ever a comic that has NEVER been published.
--
--   draft      never published. editable. only the owner sees it.
--   published  public.
--   private    was published, now hidden. NOT editable. contributions safe.
--
-- Allowed: draft -> published, published <-> private, delete from any.
-- Forbidden: anything -> draft, enforced by a trigger rather than by the ui.

alter table public.comics drop constraint if exists comics_status_check;
alter table public.comics add constraint comics_status_check
  check (status in ('draft', 'published', 'private'));

create or replace function public.comics_status_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception
      'a comic that has been published cannot go back to being a draft; make it private instead'
      using errcode = '23514';
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists comics_status on public.comics;
create trigger comics_status before update on public.comics
  for each row execute function public.comics_status_guard();

-- the owner sees their own rows whatever the state; everyone else sees
-- published only (that policy lives in schema.sql)
drop policy if exists comics_owner_read on public.comics;
create policy comics_owner_read on public.comics for select
  using (owner_id = auth.uid());

-- a private comic's thread is not public either
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select
  using (exists (
    select 1 from public.comics c
    where c.id = comments.comic_id
      and (c.status = 'published' or c.owner_id = auth.uid())));

-- ------------------------------------------------------------------ profile
-- What you have finished and what you have not shown anyone are never public
-- and have no setting. The shelf is the one where it is a real question.
alter table public.profiles
  add column if not exists shelf_public boolean not null default false;

drop policy if exists saves_public_shelf on public.saves;
create policy saves_public_shelf on public.saves for select
  using (
    status = 'later'
    and exists (select 1 from public.profiles p
                where p.id = saves.user_id and p.shelf_public));

-- ------------------------------------------------------------------ avatars
-- public to read, writable only into a folder named after your own uid
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------ verify
select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'comics_status_check';
