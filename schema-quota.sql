-- eski, an upload ceiling. run any time; safe to re-run.
--
-- WHAT WAS WRONG. api/sign.mjs signs up to 500 presigned PUTs per call for any
-- signed-in user, with no per-user limit and no total. One person with a
-- script and a free account could fill the bucket and the bill overnight, and
-- R2 charges per operation, so the damage is done before anyone looks.
--
-- WHY IT IS COUNTED HERE AND NOT IN THE FUNCTION. A counter the client can
-- reach is a counter the client can reset. This is SECURITY DEFINER and only
-- ever ADDS — there is no argument that decreases it and no policy letting
-- anyone UPDATE the table directly, so the worst a caller can do is spend
-- their own allowance faster.
--
-- WHY A DAY. A rolling window needs a scan; a day needs one row per user per
-- day and a primary key. The cap resets at UTC midnight, which is crude and
-- obvious, and obvious is the right trade for a ceiling nobody should ever
-- reach.

create table if not exists upload_quota (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  objects  integer not null default 0,
  primary key (user_id, day)
);

-- the ceiling. a 45-page comic is roughly 45-90 objects once pages, a cover
-- and audio are counted, so this is about twenty comics a day: far past any
-- honest session and far short of anything that costs real money.
create or replace function upload_cap() returns integer language sql immutable as $$
  select 2000;
$$;

-- CLAIM, don't check-then-write. Two calls racing a check would both see room
-- and both proceed; the insert..on conflict..do update is atomic, and the
-- decision is made from the value it returns rather than one read earlier.
create or replace function claim_upload_quota(n integer)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if uid is null then
    return json_build_object('ok', false, 'why', 'not signed in');
  end if;
  if n is null or n < 1 or n > 500 then
    return json_build_object('ok', false, 'why', 'bad count');
  end if;

  insert into upload_quota (user_id, day, objects)
  values (uid, today, n)
  on conflict (user_id, day) do update
    set objects = upload_quota.objects + excluded.objects
  returning objects into used;

  if used > upload_cap() then
    -- put it back: the claim failed, so it must not count against them
    update upload_quota set objects = objects - n
     where user_id = uid and day = today;
    return json_build_object('ok', false, 'why', 'daily limit',
                             'used', used - n, 'cap', upload_cap());
  end if;

  return json_build_object('ok', true, 'used', used, 'cap', upload_cap());
end $$;

alter table upload_quota enable row level security;

-- you may READ your own tally, so a studio could show it. nobody writes
-- directly: the function is the only way in, which is what makes it a ceiling
-- rather than a suggestion.
drop policy if exists quota_read_own on upload_quota;
create policy quota_read_own on upload_quota for select using (user_id = auth.uid());

grant select on upload_quota to authenticated;
grant execute on function claim_upload_quota(integer) to authenticated;
grant execute on function upload_cap() to authenticated, anon;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select 'cap' as check, upload_cap()::text as value
union all
select 'claim is security definer',
       (select prosecdef::text from pg_proc where proname = 'claim_upload_quota')
union all
select 'nobody can write the table directly',
       (select count(*)::text from pg_policies
         where tablename = 'upload_quota' and cmd in ('INSERT','UPDATE','DELETE'));
