-- eski schema · 15 · P2 search  (P2.16)
-- FTS indexes + one ranked union across messages / works / comments.

create index if not exists idx_messages_body_tsv on messages using gin (body_tsv);
create index if not exists idx_works_search_tsv  on works    using gin (search_tsv);

-- SECURITY INVOKER on purpose: the query runs as the caller, so the existing RLS
-- (msg_read=can_view_channel, works_read=can_read_work, cmt_read=can_read_work) is
-- what filters the rows — a private channel or hidden/personal work cannot leak.
-- scope = 'global' or a server_id; an empty query returns recents (rank 0, newest
-- first). The client parses from:/in:/has: modifiers into args.
create or replace function search_all(q text, scope text default 'global')
  returns table (source text, id uuid, title text, snippet text, rank real, created_at timestamptz)
  language sql stable security invoker set search_path = public as $$
  with sid as (select case when scope is null or scope = 'global' then null else scope::uuid end as s),
       tsq as (select case when coalesce(trim(q), '') = '' then null
                           else websearch_to_tsquery('english', q) end as query)
  select 'message'::text, m.id, null::text, left(coalesce(m.body, ''), 160),
         case when (select query from tsq) is null then 0::real else ts_rank(m.body_tsv, (select query from tsq)) end,
         m.created_at
    from messages m
    join channels c on c.id = m.channel_id
   where m.deleted_at is null
     and ((select s from sid) is null or c.server_id = (select s from sid))
     and ((select query from tsq) is null or m.body_tsv @@ (select query from tsq))
  union all
  select 'work'::text, w.id, w.title, left(coalesce(w.title, ''), 160),
         case when (select query from tsq) is null then 0::real else ts_rank(w.search_tsv, (select query from tsq)) end,
         w.created_at
    from works w
   where w.deleted_at is null
     and ((select s from sid) is null
          or (w.owner_type = 'server' and w.owner_id = (select s from sid))
          or w.server_id = (select s from sid)
          or exists (select 1 from placement p where p.work_id = w.id and p.surface = 'server' and p.surface_id = (select s from sid)))
     and ((select query from tsq) is null or w.search_tsv @@ (select query from tsq))
  union all
  select 'comment'::text, cm.id, null::text, left(coalesce(cm.body, ''), 160),
         case when (select query from tsq) is null then 0::real
              else ts_rank(to_tsvector('english', coalesce(cm.body, '')), (select query from tsq)) end,
         cm.created_at
    from comments cm
   where cm.deleted_at is null
     and (select s from sid) is null   -- comments are post-level/public, not server-scoped
     and ((select query from tsq) is null or to_tsvector('english', coalesce(cm.body, '')) @@ (select query from tsq))
  order by 5 desc, 6 desc
  limit 50;
$$;

grant execute on function search_all(text, text) to authenticated;
