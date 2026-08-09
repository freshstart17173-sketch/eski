-- eski, closing what Supabase's security linter found. run any time; safe to
-- re-run. Applied 9 Aug 2026, before showing the site to anybody.
--
-- It found 26 things. This closes 18 of them and leaves 8 that are deliberate,
-- named below with the reason — because a linter you have learned to ignore is
-- worse than one you never ran.

-- ============================================================ 1. search_path
-- THE ONE THAT WAS ACTUALLY DANGEROUS.
--
-- A SECURITY DEFINER function runs as its owner. If its search_path is not
-- pinned, the CALLER chooses where an unqualified name resolves: create a
-- `profiles` table in a schema you control, put it first on the search_path,
-- call the function, and it operates on your table with the owner's rights.
-- That is privilege escalation, and eleven functions were open to it.
--
-- claim_upload_quota already did this (`set search_path = public`), which is
-- what made the omission elsewhere an oversight rather than a policy.
--
-- ALTER, not CREATE OR REPLACE: the setting is a property of the function, so
-- there is no need to restate a body and no chance of restating it wrongly.
alter function public.canonical_tag(text)              set search_path = public;
alter function public.touch_updated_at()               set search_path = public;
alter function public.get_comic(uuid)                  set search_path = public;
alter function public.get_shelf(text, integer)         set search_path = public;
alter function public.comments_depth_guard()           set search_path = public;
alter function public.comments_tombstone()             set search_path = public;
alter function public.comments_author()                set search_path = public;
alter function public.comics_status_guard()            set search_path = public;
alter function public.upload_cap()                     set search_path = public;
alter function public.profiles_tombstone()             set search_path = public;
alter function public.account_live()                   set search_path = public;
alter function public.delete_my_account()              set search_path = public;
alter function public.eski_part_allowed(uuid, text)    set search_path = public;
alter function public.is_admin()                       set search_path = public;
alter function public.admin_overview()                 set search_path = public;
alter function public.admin_users(integer)             set search_path = public;
alter function public.rls_auto_enable()                set search_path = public;

-- ================================================================ 2. grants
-- POSTGRES GRANTS EXECUTE TO `PUBLIC` ON EVERY NEW FUNCTION, and PUBLIC
-- includes anon. So `revoke execute ... from anon` on its own does NOTHING
-- while the PUBLIC grant stands — the first attempt at this changed not one
-- advisor finding, which is how that was discovered. Revoke from PUBLIC, then
-- grant back deliberately.

-- TRIGGER FUNCTIONS. Nobody calls these directly; a trigger fires in the
-- table's own context and needs no EXECUTE from the querying role. Clean
-- revoke, nothing granted back. PostgREST was exposing every one of them at
-- /rest/v1/rpc/<name>.
revoke execute on function public.comments_author()       from public, anon, authenticated;
revoke execute on function public.comments_tombstone()    from public, anon, authenticated;
revoke execute on function public.comments_depth_guard()  from public, anon, authenticated;
revoke execute on function public.comics_status_guard()   from public, anon, authenticated;
revoke execute on function public.profiles_tombstone()    from public, anon, authenticated;
revoke execute on function public.touch_updated_at()      from public, anon, authenticated;
-- an EVENT trigger function; calling it outside that context errors anyway
revoke execute on function public.rls_auto_enable()       from public, anon, authenticated;

-- SIGNED IN ONLY. Both admin RPCs already refuse a non-admin from inside, so
-- this is the second lock rather than the first — but an unauthenticated
-- caller should not reach the body at all.
revoke execute on function public.admin_overview()     from public, anon;
revoke execute on function public.admin_users(integer) from public, anon;
grant  execute on function public.admin_overview()     to authenticated;
grant  execute on function public.admin_users(integer) to authenticated;

-- an upload allowance belongs to an account
revoke execute on function public.claim_upload_quota(integer) from public, anon;
grant  execute on function public.claim_upload_quota(integer) to authenticated;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

-- ============================================== 3. what is left, and why
-- KEPT REACHABLE ON PURPOSE. is_admin() and eski_part_allowed() are evaluated
-- inside RLS policies that anonymous readers hit. A policy expression runs
-- with the QUERYING role's privileges, so revoking EXECUTE turns "returns
-- false" into "permission denied for function" and breaks reading the site
-- signed out. Both take no secrets as arguments and return a boolean.
revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to anon, authenticated;
revoke execute on function public.eski_part_allowed(uuid, text) from public;
grant  execute on function public.eski_part_allowed(uuid, text) to anon, authenticated;

-- The advisor still reports, and each is answered:
--   eski_part_allowed / is_admin, anon + authenticated  — the paragraph above
--   admin_overview / admin_users, authenticated         — correct; they check
--       is_admin() and raise 42501. Signed-in IS the audience.
--   claim_upload_quota, authenticated                   — correct; that is the
--       only role with an allowance to spend.
--   auth_leaked_password_protection disabled            — eski has no
--       passwords. Sign-in is OAuth only (PROVIDERS in platform.js). Worth
--       turning on if magic links or passwords are ever added; today it
--       protects nothing.

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
select 'functions with a mutable search_path' as check,
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proconfig is null) as value
union all
select 'anon can call admin_overview',
       (select count(*)::text from information_schema.role_routine_grants
         where routine_name='admin_overview' and grantee='anon')
union all
select 'signed-out reading still works (get_shelf)',
       (select case when get_shelf(null,1) is not null then 'yes' end);
