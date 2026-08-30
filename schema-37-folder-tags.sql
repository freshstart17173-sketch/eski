-- eski schema · 37 · P23 folder tags (a folder is taggable; tags do NOT inherit to its files)
--
-- Owner ask: a FOLDER should carry its own tags, like a work does — but explicitly WITHOUT
-- propagation: a file inside a tagged folder does NOT inherit the folder's tags. So this is a
-- separate store keyed by folder, never joined into a work's tags.
--
-- There are two folder kinds (server `folders`, personal `save_folders`), so folder_tags carries a
-- nullable FK to each and a check that exactly one is set — one table, both kinds, each row cascades
-- when its folder is deleted. Tags reuse the same "type:value or bare" convention as content_tags
-- (the client's parseTag/makeTag), so the same coloured tagChip renders them.
--
-- Fences mirror the folders' OWN policies (verified live): a server folder is writable by
-- has_perm(manage_channels) and readable by member_of; a personal folder is owner-only. Both fences
-- are SECURITY DEFINER helpers (reliable over MCP — they read auth.uid() at call time, dodging the
-- inline-uid InitPlan trap in VERIFICATION.md), and the writes also go through DEFINER RPCs.

create table if not exists folder_tags (
  id             uuid primary key default gen_random_uuid(),
  folder_id      uuid references folders(id)      on delete cascade,   -- server folder
  save_folder_id uuid references save_folders(id) on delete cascade,   -- personal folder
  tag            text not null,
  created_at     timestamptz not null default now(),
  constraint folder_tags_one_target check (num_nonnulls(folder_id, save_folder_id) = 1),
  constraint folder_tags_tag_len   check (char_length(tag) between 1 and 120)
);
-- one row per (folder, tag); partial uniques because only one target column is set per row
create unique index if not exists uq_folder_tags_server   on folder_tags(folder_id, tag)      where folder_id is not null;
create unique index if not exists uq_folder_tags_personal on folder_tags(save_folder_id, tag) where save_folder_id is not null;
create index if not exists idx_folder_tags_folder on folder_tags(folder_id)      where folder_id is not null;
create index if not exists idx_folder_tags_save   on folder_tags(save_folder_id) where save_folder_id is not null;

-- ── access predicates (SECURITY DEFINER → reliable) ──────────────────────────
-- can this caller READ a folder (and hence its tags)? server → member; personal → owner.
create or replace function folder_tag_readable(p_folder uuid, p_save uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_folder is not null then member_of((select server_id from folders where id = p_folder))
    when p_save   is not null then exists (select 1 from save_folders sf where sf.id = p_save and sf.user_id = (select auth.uid()))
    else false end;
$$;
-- can this caller WRITE a folder's tags? server → manage_channels (same as editing the folder);
-- personal → owner. Mirrors the folders/save_folders own write policies exactly.
create or replace function folder_tag_writable(p_folder uuid, p_save uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_folder is not null then has_perm((select server_id from folders where id = p_folder), perm_bit('manage_channels'))
    when p_save   is not null then exists (select 1 from save_folders sf where sf.id = p_save and sf.user_id = (select auth.uid()))
    else false end;
$$;

alter table folder_tags enable row level security;
drop policy if exists ft_read on folder_tags;
drop policy if exists ft_ins  on folder_tags;
drop policy if exists ft_del  on folder_tags;
create policy ft_read on folder_tags for select using (folder_tag_readable(folder_id, save_folder_id));
create policy ft_ins  on folder_tags for insert with check (folder_tag_writable(folder_id, save_folder_id));
create policy ft_del  on folder_tags for delete using  (folder_tag_writable(folder_id, save_folder_id));
-- no UPDATE policy: tags are add/remove only (same as content_tags).

-- ── write RPCs (DEFINER, re-check the fence — the reliable path for a load-bearing write) ──
create or replace function add_folder_tag(p_folder uuid, p_save_folder uuid, p_tag text)
returns folder_tags language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); res folder_tags; t text := nullif(btrim(p_tag), '');
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if num_nonnulls(p_folder, p_save_folder) <> 1 then raise exception 'exactly one folder target' using errcode = '22023'; end if;
  if t is null then raise exception 'empty tag' using errcode = '22023'; end if;
  if not folder_tag_writable(p_folder, p_save_folder) then raise exception 'not allowed to tag this folder' using errcode = '42501'; end if;
  insert into folder_tags (folder_id, save_folder_id, tag) values (p_folder, p_save_folder, t)
    on conflict do nothing
    returning * into res;
  if res.id is null then   -- already present → return the existing row (idempotent, like add_tag)
    select * into res from folder_tags ft
     where ft.tag = t and (
       (p_folder is not null and ft.folder_id = p_folder) or
       (p_save_folder is not null and ft.save_folder_id = p_save_folder));
  end if;
  return res;
end;
$$;

create or replace function remove_folder_tag(p_folder uuid, p_save_folder uuid, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not folder_tag_writable(p_folder, p_save_folder) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from folder_tags ft
   where ft.tag = p_tag and (
     (p_folder is not null and ft.folder_id = p_folder) or
     (p_save_folder is not null and ft.save_folder_id = p_save_folder));
end;
$$;

-- reads go direct (RLS-fenced); writes go through the DEFINER RPCs. Lock the RPCs + helpers to
-- authenticated (mirrors p22/p31 hygiene — no anon/public execute on SECURITY DEFINER functions).
grant select, insert, delete on folder_tags to authenticated;
revoke all on function folder_tag_readable(uuid, uuid) from public, anon;
revoke all on function folder_tag_writable(uuid, uuid) from public, anon;
revoke all on function add_folder_tag(uuid, uuid, text) from public, anon;
revoke all on function remove_folder_tag(uuid, uuid, text) from public, anon;
grant execute on function add_folder_tag(uuid, uuid, text) to authenticated;
grant execute on function remove_folder_tag(uuid, uuid, text) to authenticated;
