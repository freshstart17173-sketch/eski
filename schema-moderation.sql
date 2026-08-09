-- eski, reporting and rate limits. run any time; safe to re-run.
--
-- TWO HOLES THAT ONLY MATTER ONCE SOMEBODY WHO IS NOT YOU CAN POST, which is
-- the moment you share the link. Both are the kind you cannot retro-fix after
-- the fact: the damage is already public by the time you notice.
--
--   1. Nothing could be reported. `admin.html` reads this table and shows a
--      queue, but no surface on the site could put a row in it, and
--      target_type was `check (target_type = 'comic')` — so a comment or a
--      contributed voice part could not be reported even in principle.
--
--   2. Nothing rate-limited text. Uploads have had a ceiling since
--      schema-quota.sql; comments, reports and parts had none at all, so one
--      account could insert as fast as the network allowed.

-- ==================================================== 1. what can be reported
-- The four things a stranger can put in front of you. `part` covers all three
-- stances rather than naming vo/soundtrack/sfx separately — the reason you
-- report a part has nothing to do with which column it was written in, and
-- parts.kind already says which it is.
alter table reports drop constraint if exists reports_target_type_check;
alter table reports add constraint reports_target_type_check
  check (target_type in ('comic', 'part', 'comment', 'profile'));

-- a reason is required and bounded, like every other free text on the site
alter table reports drop constraint if exists reports_reason_len;
alter table reports add constraint reports_reason_len
  check (char_length(btrim(reason)) between 1 and 2000);

/* ONE OPEN REPORT PER PERSON PER THING. Not a rate limit — a correctness rule.
   Ten reports of the same comic from one account is one complaint, and it
   would sit in the queue as ten rows to read and close. Partial, so the same
   person may report the same thing again once the first is closed: they may
   have a new reason, and the old row is already dealt with. */
create unique index if not exists reports_one_open_per_reporter
  on reports (reporter_id, target_type, target_id)
  where status = 'open' and reporter_id is not null;

create index if not exists reports_open_idx on reports (created_at desc)
  where status = 'open';

-- ========================================================= 2. the rate limit
/* THE SAME SHAPE AS schema-quota.sql, and for the same reason: a counter the
   client can reach is a counter the client can reset. This is SECURITY
   DEFINER, it only ever ADDS, there is no argument that decreases it, and no
   policy lets anyone write the table directly.

   A ROLLING HOUR, not a calendar one. The upload quota resets at UTC midnight
   because twenty comics a day is a ceiling nobody legitimate approaches, so
   crude is fine. Text is different: somebody commenting normally in the hour
   before midnight would get a fresh allowance at midnight and none of the
   protection. An hour of history is one small index scan.

   PER ACTION, not one pooled number. Filing reports and writing comments are
   different behaviours with different honest volumes, and pooling them means
   a chatty reader loses the ability to report something. */
create table if not exists rate_events (
  user_id  uuid not null references auth.users(id) on delete cascade,
  action   text not null check (action in ('comment', 'report', 'part')),
  at       timestamptz not null default now()
);

create index if not exists rate_events_lookup on rate_events (user_id, action, at desc);

alter table rate_events enable row level security;
-- NO policies at all, deliberately: the function below is SECURITY DEFINER and
-- is the only way in or out. RLS denies by default, so a table with no policy
-- is unreachable from PostgREST even with a valid token.

create or replace function rate_limit(kind text) returns integer
language sql immutable set search_path = public as $$
  select case kind
    -- a real conversation is a handful of comments an hour, not thirty
    when 'comment' then 30
    -- reporting is rarer than commenting and more expensive to receive
    when 'report'  then 10
    -- publishing a part is minutes of work each; ten an hour is already odd
    when 'part'    then 10
    else 0
  end;
$$;

/* CLAIM, don't check-then-write — the same reasoning as claim_upload_quota.
   Two calls racing a check would both see room. The insert happens first and
   the decision is made from a count that already includes it. */
create or replace function claim_rate(kind text)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  cap  integer := rate_limit(kind);
  used integer;
begin
  if uid is null then
    return json_build_object('ok', false, 'why', 'not signed in');
  end if;
  if cap = 0 then
    return json_build_object('ok', false, 'why', 'unknown action');
  end if;

  insert into rate_events (user_id, action) values (uid, kind);

  select count(*) into used from rate_events
   where user_id = uid and action = kind and at > now() - interval '1 hour';

  if used > cap then
    -- put it back: a refused action must not count against the next hour
    delete from rate_events
     where ctid in (select ctid from rate_events
                     where user_id = uid and action = kind
                     order by at desc limit 1);
    return json_build_object('ok', false, 'why', 'rate limit',
                             'used', used - 1, 'cap', cap,
                             'retry_after_minutes',
      coalesce((select ceil(extract(epoch from
        (min(at) + interval '1 hour' - now())) / 60)::int
        from (select at from rate_events
               where user_id = uid and action = kind
                 and at > now() - interval '1 hour'
               order by at asc limit 1) oldest), 60));
  end if;

  return json_build_object('ok', true, 'used', used, 'cap', cap);
end $$;

/* HOUSEKEEPING. Rows older than an hour can never affect an answer, and this
   table grows on every comment forever otherwise. Cheap because the index is
   already on (user_id, action, at) and this runs inside a call that was
   already writing. One in fifty, so it is not on the hot path of every insert. */
create or replace function claim_rate_sweep() returns void
language sql security definer set search_path = public as $$
  delete from rate_events where at < now() - interval '2 hours';
$$;

grant execute on function claim_rate(text) to authenticated;
grant execute on function rate_limit(text) to authenticated;
revoke execute on function claim_rate(text)       from public, anon;
revoke execute on function rate_limit(text)       from public, anon;
revoke execute on function claim_rate_sweep()     from public, anon, authenticated;

-- ============================================== 3. filing a report, properly
/* SECURITY DEFINER, unlike delete_my_account(), and the difference is worth
   stating. Deleting your account touches only your own row, so it can run as
   the caller and let RLS do the work. Filing a report has to do two things the
   caller must not be able to do separately: spend a rate allowance, and insert
   into a table nobody may read. Doing it in one function means a caller cannot
   file without paying, or pay without filing. */
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
  if p_type not in ('comic','part','comment','profile') then
    return json_build_object('ok', false, 'why', 'unknown target');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    return json_build_object('ok', false, 'why', 'a reason is required');
  end if;
  if char_length(p_reason) > 2000 then
    return json_build_object('ok', false, 'why', 'reason too long');
  end if;

  /* THE TARGET MUST EXIST. Without this the table is an open write endpoint:
     anybody could post 2000 characters against ten thousand random uuids and
     the queue becomes unreadable. Checked with the definer's rights on
     purpose — a private comic can still be reported by somebody who was shown
     it, and a report on a row the reporter cannot SELECT is exactly the case
     that matters. */
  execute format(
    'select exists (select 1 from %I where id = $1)',
    case p_type when 'comic'   then 'comics'
                when 'part'    then 'parts'
                when 'comment' then 'comments'
                else                'profiles' end)
    into exists_ok using p_id;

  if not exists_ok then
    return json_build_object('ok', false, 'why', 'that no longer exists');
  end if;

  /* ALREADY REPORTED IS NOT AN ERROR. They asked for this thing to be looked
     at; it is going to be looked at. Saying "you already did" is both true and
     useless, so it answers ok and says so. */
  if exists (select 1 from reports r
              where r.reporter_id = uid and r.target_type = p_type
                and r.target_id = p_id and r.status = 'open') then
    return json_build_object('ok', true, 'already', true);
  end if;

  gate := claim_rate('report');
  if not (gate->>'ok')::boolean then return gate; end if;

  insert into reports (target_type, target_id, reporter_id, reason)
  values (p_type, p_id, uid, btrim(p_reason));

  -- one in fifty calls tidies up behind everybody
  if random() < 0.02 then perform claim_rate_sweep(); end if;

  return json_build_object('ok', true);
end $$;

grant execute on function file_report(text, uuid, text) to authenticated;
revoke execute on function file_report(text, uuid, text) from public, anon;

/* THE DIRECT INSERT POLICY IS GONE. reports_file let a signed-in caller write
   the table straight from PostgREST, which would walk around the rate limit,
   the target check and the duplicate rule — all of which live in file_report()
   above. The function is now the only door. */
drop policy if exists reports_file on reports;

-- ======================================== 4. the rate limit on comments
/* Comments are inserted directly by comments.js rather than through an RPC,
   and rewriting that is a bigger change than this needs. So the ceiling is
   enforced where the insert already happens: a BEFORE INSERT trigger that
   claims an allowance and raises if there is none.

   A TRIGGER, NOT A POLICY. A policy expression may be evaluated more than once
   per row and must be side-effect free; claiming an allowance is a side
   effect. Doing it in a policy would burn allowance unpredictably. */
create or replace function comments_rate_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare gate json;
begin
  gate := claim_rate('comment');
  if not (gate->>'ok')::boolean then
    raise exception 'ESK-5900 you are commenting too quickly. Try again in % minutes.',
      coalesce(gate->>'retry_after_minutes', '60')
      using errcode = '53400';
  end if;
  if random() < 0.02 then perform claim_rate_sweep(); end if;
  return new;
end $$;

drop trigger if exists comments_rate on public.comments;
create trigger comments_rate before insert on public.comments
  for each row execute function comments_rate_guard();

revoke execute on function comments_rate_guard() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select 'reportable target types' as check,
       (select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'reports_target_type_check') as value
union all
select 'rate_events has NO policy (the function is the only door)',
       (select count(*)::text from pg_policies where tablename = 'rate_events')
union all
select 'the direct insert policy on reports is gone',
       (select count(*)::text from pg_policies
         where tablename = 'reports' and cmd = 'INSERT')
union all
select 'comments carry a rate trigger',
       (select count(*)::text from pg_trigger where tgname = 'comments_rate')
union all
select 'caps', (select rate_limit('comment')::text || ' comments, ' ||
                       rate_limit('report')::text  || ' reports, ' ||
                       rate_limit('part')::text    || ' parts per hour');
