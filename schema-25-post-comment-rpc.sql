-- eski schema · 25 · post_comment RPC (K8 write-reliability)  — migration: p15_post_comment_rpc
--
-- K8 finding (the reliable-write audit). The upload 42501 taught us that a DIRECT client INSERT
-- whose RLS WITH CHECK is a COMPLEX inline-`auth.uid()` expression can fail live even though it
-- evaluates TRUE by hand. The tell: `works_insert` (a CASE + member_of + has_perm + subqueries)
-- failed for every user, while `servers_insert` — a SIMPLE `owner_id = (select auth.uid())` — has
-- always worked. So the risk lives in the COMPLEX inline-uid checks, not the simple ones.
--
-- Auditing every write (see docs/TODO.md K8 catalogue), the one remaining complex inline-uid
-- CONTENT write still done as a direct client insert is `comments` (cmt_insert):
--   user_id = auth.uid()  AND  can_read_work(work_id)
--   AND ( the caller authored the work  OR  is_friend(work.author_id) )
-- — a friend/author subquery gate structurally just like the works one that broke. Rather than
-- trust it, route it through a SECURITY DEFINER RPC (the proven-reliable pattern: create_work,
-- join_via_invite, …). The RPC re-checks the SAME fence explicitly, so nothing is loosened; it
-- just can't be silently denied by the flaky inline-uid path. Simple owner-only writes
-- (saved_items, starred_items, reports — all `user_id/reporter_id = auth.uid()`, the working
-- servers_insert shape) are LEFT as direct writes; converting them would be churn without cause.

create or replace function public.post_comment(p_work_id uuid, p_body text)
  returns table(id uuid, created_at timestamptz)
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  uid     uuid := (select auth.uid());
  wauthor uuid;
  body    text := trim(coalesce(p_body, ''));
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(body) = 0 then raise exception 'write something first' using errcode = '22023'; end if;
  -- cap parity with the schema's free-text guard (comments.body is length-capped); trim + bound.
  if length(body) > 4000 then body := left(body, 4000); end if;

  -- fence, mirroring cmt_insert exactly:
  if not can_read_work(p_work_id) then
    raise exception 'you can’t see this post' using errcode = '42501'; end if;
  select author_id into wauthor from works where works.id = p_work_id;
  if wauthor is null then
    raise exception 'no such post' using errcode = '22023'; end if;
  if wauthor <> uid and not is_friend(wauthor) then
    raise exception 'only the author and their friends can comment' using errcode = '42501'; end if;

  -- context defaults to 'public' (the only allowed value); never set it here.
  return query
    insert into comments (work_id, user_id, body)
      values (p_work_id, uid, body)
    returning comments.id, comments.created_at;
end
$function$;

revoke all on function public.post_comment(uuid, text) from public;
revoke all on function public.post_comment(uuid, text) from anon;
grant execute on function public.post_comment(uuid, text) to authenticated;
