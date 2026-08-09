-- eski, deleting your account. run any time; safe to re-run.
--
-- THE DECISION: A DELETED ACCOUNT IS TOMBSTONED, NOT ERASED.
--
-- Erasing the row was the other option and it is wrong here, for the same
-- reason it was wrong for comments (schema-comments.sql already tombstones
-- those). eski's whole currency is attribution. A comic has an author, a part
-- has a performer, and a thread has a conversation — pull one row out and you
-- get a comic by nobody, a voice credited to nothing, and replies answering a
-- gap. The work does not stop existing because the person left, and the people
-- who contributed to it did not leave.
--
-- So: the profile row STAYS, everything personal in it goes, and every page
-- that pointed at it now says the account was deleted. Same shape as a
-- tombstoned comment: the container survives, the contents do not.
--
-- THE HANDLE IS KEPT AND NOT RELEASED. Two reasons, and the second is the
-- important one. /u/<handle> keeps resolving, so links and bylines still land
-- somewhere truthful instead of 404ing. And a released handle can be RE-taken:
-- somebody signs up as the departed author and inherits the credibility of
-- their back catalogue. That is the impersonation problem the reserved list
-- exists to prevent, arriving by a different door.
--
-- WHAT THIS DOES NOT DO, stated plainly rather than left to be discovered:
-- it does not delete the auth.users row, so the email address and the Google
-- identity survive. For UK GDPR erasure they must not. Doing that properly
-- means repointing eight foreign keys off auth.users — today they cascade, so
-- deleting the auth user would take the comics and comments with it, which is
-- the exact opposite of this file. It is a pass of its own; ROADMAP item 20
-- carries the shape of it. Until then a real erasure request is a manual job.

alter table profiles add column if not exists deleted_at timestamptz;
comment on column profiles.deleted_at is
  'tombstone. set = the account was deleted; the row survives so bylines and '
  '/u/<handle> still resolve. the trigger below clears everything personal.';

create index if not exists profiles_live_idx on profiles (id) where deleted_at is null;

-- ------------------------------------------------------------------ the scrub
-- A TRIGGER, NOT THE CALLER'S JOB. If clearing the personal columns lived in
-- the RPC, a second caller — an admin tool, a manual UPDATE in the dashboard —
-- would set deleted_at and leave the name sitting there. Whatever sets the
-- tombstone gets the scrub.
create or replace function public.profiles_tombstone()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.display_name := null;
    new.bio          := null;
    new.avatar_url   := null;
    /* shelf_public is left alone: it is a preference, not a fact about them,
       and the shelf itself is deleted by the RPC below either way.
       There is no thumb_key here — that column is on comics, not profiles.
       Assigning it was a copy-paste that postgres refused outright, which is
       the good kind of failure: NEW has no such field, so the trigger threw
       rather than silently skipping the scrub. */
    -- handle is deliberately NOT cleared: see the header

    /* AND THE COPIES, which is the part that is easy to miss. Two columns
       denormalise the name at insert so a byline needs no join:
       comics.owner_name and comments.author_name. Clearing profiles alone
       would leave the person's real name sitting on every comic they
       published and every comment they wrote — the deletion would look done
       and have cleared nothing anybody can actually see.

       comics.owner_name is documented in schema.sql as a deliberate
       historical snapshot, so that a rename does not rewrite old bylines.
       That reasoning holds for a RENAME and not for a DELETION: the point of
       renaming is that both names are yours, and the point of deleting is
       that neither is.

       The handles are left pointing at this row, so those bylines still link
       here and land on the tombstone screen. */
    update public.comics   set owner_name  = 'Deleted account' where owner_id = new.id;
    update public.comments set author_name = 'Deleted account' where user_id  = new.id;
    return new;
  end if;
  -- UNDELETING IS NOT A FEATURE. Allowing it would mean the scrubbed name has
  -- to come back from somewhere, and the only honest answer is that it is
  -- gone. A person who returns signs up again.
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'a deleted account cannot be restored'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_tomb on public.profiles;
create trigger profiles_tomb before update on public.profiles
  for each row execute function public.profiles_tombstone();

-- ------------------------------------------------------------- is it alive?
-- STABLE, and reads only the row it is given, so it is cheap enough to sit in
-- a policy. NOT security definer: profiles are publicly readable anyway, so it
-- needs no elevation and must not have any.
create or replace function public.account_live()
returns boolean language sql stable as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.deleted_at is null);
$$;

-- ------------------------------------------------------------------ the door
-- NOT security definer either, and that is the point: it updates the caller's
-- own row through the same policy anybody else would face, so a bug here
-- cannot delete somebody else's account.
create or replace function public.delete_my_account()
returns json language plpgsql as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return json_build_object('ok', false, 'why', 'not signed in');
  end if;

  update profiles set deleted_at = now()
   where id = uid and deleted_at is null;

  if not found then
    -- already gone, or no profile at all. Either way the end state is the one
    -- they asked for, so this is not an error.
    return json_build_object('ok', true, 'already', true);
  end if;

  /* PUBLISHED WORK IS NOT WITHDRAWN, and this is the part worth being sure
     about. A comic other people voiced, scored and commented on is not solely
     the author's to remove — unpublishing it would silently destroy every
     contributor's part along with it. It stays up, credited to a deleted
     account. Anyone who wants their OWN part down can already take it down;
     parts_update says so explicitly.

     DRAFTS ARE DIFFERENT. Nobody has ever seen them, nobody has built on them,
     and they are unambiguously personal. They go. */
  delete from comics where owner_id = uid and status = 'draft';

  -- the private-to-you shelf, and the tallies that only describe them
  delete from saves        where user_id = uid;
  delete from follows      where follower_id = uid;
  delete from upload_quota where user_id = uid;
  delete from user_prefs   where user_id = uid;

  return json_build_object('ok', true);
end $$;

-- --------------------------------------------------------------------- rls
-- A DELETED ACCOUNT MAY NOT KEEP POSTING. The session survives deletion until
-- its token expires, and the client signs them out — but the client is not
-- what enforces anything here. These are.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (
    user_id = auth.uid()
    and deleted_at is null
    and account_live()
    and exists (select 1 from public.comics c
                where c.id = comic_id and c.status = 'published'));

drop policy if exists parts_insert on parts;
create policy parts_insert on parts for insert
  with check (owner_id = auth.uid() and account_live()
              and eski_part_allowed(comic_id, kind));

drop policy if exists comics_write on comics;
create policy comics_write on comics for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and account_live());

drop policy if exists kudos_add on kudos;
create policy kudos_add on kudos for insert
  with check (user_id = auth.uid() and account_live());

grant execute on function delete_my_account() to authenticated;
grant execute on function account_live() to authenticated, anon;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select 'deleted_at exists' as check,
       (select count(*)::text from information_schema.columns
         where table_name='profiles' and column_name='deleted_at') as value
union all
select 'the scrub is a trigger, not the caller''s job',
       (select count(*)::text from pg_trigger where tgname='profiles_tomb')
union all
select 'delete_my_account is NOT security definer',
       (select (not prosecdef)::text from pg_proc where proname='delete_my_account')
union all
select 'account_live is NOT security definer',
       (select (not prosecdef)::text from pg_proc where proname='account_live')
union all
select 'policies that now require a live account',
       (select count(*)::text from pg_policy
         where coalesce(pg_get_expr(polwithcheck, polrelid),'') like '%account_live%');
