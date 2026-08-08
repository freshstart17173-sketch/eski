-- eski, the shelf in one round trip. run any time; safe to re-run.
--
-- WHAT WAS WRONG. Opening home was TWO SERIAL round trips — the comics, then
-- everything keyed by their ids, which cannot start until the first returns.
-- On a phone at 150ms that is 300ms before anything can render.
--
-- Worse than the latency was the payload. The second trip fetched every
-- `pages` row, every `tracks` row, every kudo, tag and comment for up to 200
-- comics, and then COUNTED THEM IN JAVASCRIPT. A 45-page comic shipped 45 rows
-- so the browser could learn the number 45. At 200 comics that is tens of
-- thousands of rows crossing the wire to produce a handful of integers.
--
-- Postgres counts. That is the entire job of this function.
--
-- STABLE and NOT SECURITY DEFINER, deliberately: it runs as the caller, so
-- auth.uid() is the real user and every row level security policy applies
-- exactly as it does to the selects it replaces. Making it SECURITY DEFINER
-- would be a way to leak other people's drafts, and there is no reason to.

create or replace function get_shelf(p_slug text default null, p_limit int default 200)
returns json language sql stable as $$
  with picked as (
    select c.*
    from comics c
    where case
            -- ONE COMIC BY NAME: no status filter. RLS already decides who may
            -- see it, and filtering here as well stopped an author opening
            -- their own draft at its own address.
            when p_slug is not null then c.slug = p_slug
            else c.status = 'published'
          end
    order by c.published_at desc nulls last
    limit case when p_slug is not null then 1 else p_limit end
  )
  select coalesce(json_agg(row_to_json(x) order by x.published_at desc nulls last), '[]'::json)
  from (
    select
      p.*,
      (select count(*) from pages    pg where pg.comic_id = p.id)                       as page_count,
      (select count(*) from kudos     k where  k.comic_id = p.id)                       as kudos_count,
      (select count(*) from comments cm where cm.comic_id = p.id
                                          and cm.deleted_at is null)                    as comment_count,
      -- whether YOU gave kudos, rather than the whole kudos table
      exists(select 1 from kudos k where k.comic_id = p.id and k.user_id = auth.uid())  as kudos_mine,
      -- your place in it, if any. one row, not the whole saves table.
      (select row_to_json(s) from saves s
        where s.comic_id = p.id and s.user_id = auth.uid())                             as save,
      (select coalesce(json_agg(t.tag order by t.tag), '[]'::json)
         from comic_tags t where t.comic_id = p.id)                                     as tags,
      -- the cast and the published parts, which is what the mix column needs
      (select coalesce(json_agg(distinct tr.character_key), '[]'::json)
         from tracks tr where tr.comic_id = p.id and tr.part_id is null
                          and tr.character_key is not null)                             as voiced,
      (select coalesce(json_agg(json_build_object(
                 'id', pt.id, 'kind', pt.kind, 'title', pt.title,
                 'by', pt.owner_name, 'character_key', pt.character_key)), '[]'::json)
         from parts pt where pt.comic_id = p.id and pt.status = 'published')            as parts,
      exists(select 1 from follows f
              where f.followee_id = p.owner_id and f.follower_id = auth.uid())                as following
    from picked p
  ) x;
$$;

-- anon may read the shelf; the policies still decide which rows come back
grant execute on function get_shelf(text, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------ verify
-- should return one json array, and the counts should agree with the tables.
select json_array_length(get_shelf()) as comics_visible;
