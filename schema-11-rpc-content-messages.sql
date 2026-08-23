-- eski schema · 11 · P2 RPCs — content & messages  (prompts/P2-rpcs.md P2.2–P2.5)
-- Re-runnable. Every function is SECURITY DEFINER (bypasses RLS) so it re-checks its
-- own gate. `#variable_conflict use_column` is set where a param shares a name with a
-- column used bare in ON CONFLICT — without it Postgres can't tell which one you mean.

-- ── P2.2 · add_collaborator / remove_collaborator / add_tag ─────────────────
-- Credit gate: work owner (author or server-admin, via can_write_work) OR an accepted
-- collaborator. Auto-accept when the credited user is a friend of the AUTHOR or a
-- co-member of a server the work is placed in; otherwise 'pending' (a self-acceptable
-- invitation). is_friend() is caller-relative, so the author↔target friendship is
-- checked inline here, not through it.
create or replace function add_collaborator(work_id uuid, handle text, role text default null)
  returns work_collaborators
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid    uuid := (select auth.uid());
  w      works;
  target uuid;
  st     text;
  res    work_collaborators;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into w from works where id = add_collaborator.work_id;
  if not found then raise exception 'no such work' using errcode = '22023'; end if;

  if not (can_write_work(w.id) or exists (
      select 1 from work_collaborators c
      where c.work_id = w.id and c.user_id = uid and c.status = 'accepted')) then
    raise exception 'not allowed to credit on this work' using errcode = '42501';
  end if;

  select id into target from profiles p where p.handle = add_collaborator.handle;
  if target is null then raise exception 'no such handle' using errcode = '22023'; end if;
  if target = w.author_id then raise exception 'author is already credited' using errcode = '22023'; end if;

  if exists (select 1 from friendships f where f.status = 'accepted'
        and ((f.a_user = w.author_id and f.b_user = target)
          or (f.a_user = target and f.b_user = w.author_id)))
     or exists (
        select 1 from server_members sa
        join server_members sb on sb.server_id = sa.server_id
        where sa.user_id = w.author_id and sa.status = 'active'
          and sb.user_id = target      and sb.status = 'active'
          and ( sa.server_id = w.server_id
             or sa.server_id in (select p.surface_id from placement p
                                 where p.work_id = w.id and p.surface = 'server')))
  then st := 'accepted'; else st := 'pending'; end if;

  insert into work_collaborators (work_id, author_id, user_id, role, status)
  values (w.id, uid, target, add_collaborator.role, st)
  on conflict (work_id, user_id) do update set role = excluded.role, author_id = excluded.author_id
  returning * into res;
  return res;
end;
$$;

-- self-remove: the credited user drops their own credit on any work. (An owner
-- removing someone else is a direct DELETE under the wc_selfremove RLS policy.)
create or replace function remove_collaborator(work_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  delete from work_collaborators c
    where c.work_id = remove_collaborator.work_id and c.user_id = uid;
end;
$$;

-- add_tag shares the credit gate (owner + accepted collaborators only) — the same
-- rule ct_write RLS enforces, restated so the RPC is self-checking.
create or replace function add_tag(work_id uuid, tag text) returns content_tags
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid()); res content_tags;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not (can_write_work(add_tag.work_id) or exists (
      select 1 from work_collaborators c
      where c.work_id = add_tag.work_id and c.user_id = uid and c.status = 'accepted')) then
    raise exception 'not allowed to tag this work' using errcode = '42501';
  end if;
  insert into content_tags (work_id, tag) values (add_tag.work_id, add_tag.tag)
  on conflict (work_id, tag) do update set tag = excluded.tag
  returning * into res;
  return res;
end;
$$;

-- ── P2.3 · mark_channel_read ────────────────────────────────────────────────
create or replace function mark_channel_read(channel_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not can_view_channel(mark_channel_read.channel_id) then
    raise exception 'cannot view channel' using errcode = '42501'; end if;
  insert into channel_reads (user_id, channel_id, last_read_at)
  values (uid, mark_channel_read.channel_id, now())
  on conflict (user_id, channel_id) do update set last_read_at = now();
end;
$$;

-- ── P2.4 · toggle_reaction (true = added, false = removed) ──────────────────
create or replace function toggle_reaction(message_id uuid, emoji text) returns boolean
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); cid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select m.channel_id into cid from messages m where m.id = toggle_reaction.message_id;
  if cid is null then raise exception 'no such message' using errcode = '22023'; end if;
  if not can_interact_channel(cid) then raise exception 'cannot react here' using errcode = '42501'; end if;

  delete from message_reactions r
    where r.message_id = toggle_reaction.message_id and r.user_id = uid and r.emoji = toggle_reaction.emoji;
  if found then return false; end if;
  insert into message_reactions (message_id, user_id, emoji)
    values (toggle_reaction.message_id, uid, toggle_reaction.emoji);
  return true;
end;
$$;

-- ── P2.5 · pin_message / unpin_message ──────────────────────────────────────
-- Pin needs the pin_message perm (in the @everyone baseline). Unpin: your own pin, or
-- a moderator (delete_any_message / admin) unpins anyone's — matches pin_delete RLS.
create or replace function pin_message(message_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid()); cid uuid; sid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select m.channel_id into cid from messages m where m.id = pin_message.message_id;
  if cid is null then raise exception 'no such message' using errcode = '22023'; end if;
  select server_id into sid from channels where id = cid;
  if not (can_view_channel(cid) and has_perm(sid, perm_bit('pin_message'))) then
    raise exception 'not allowed to pin' using errcode = '42501'; end if;
  insert into message_pins (channel_id, message_id, pinned_by)
    values (cid, pin_message.message_id, uid)
  on conflict (channel_id, message_id) do nothing;
end;
$$;

create or replace function unpin_message(message_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); cid uuid; owner uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select p.channel_id, p.pinned_by into cid, owner
    from message_pins p where p.message_id = unpin_message.message_id;
  if cid is null then return; end if;   -- not pinned → no-op
  if owner = uid or can_moderate_channel(cid) then
    delete from message_pins p where p.message_id = unpin_message.message_id;
  else
    raise exception 'cannot unpin another member''s pin' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function add_collaborator(uuid,text,text), remove_collaborator(uuid),
  add_tag(uuid,text), mark_channel_read(uuid), toggle_reaction(uuid,text),
  pin_message(uuid), unpin_message(uuid) from anon, public;
grant execute on function add_collaborator(uuid,text,text), remove_collaborator(uuid),
  add_tag(uuid,text), mark_channel_read(uuid), toggle_reaction(uuid,text),
  pin_message(uuid), unpin_message(uuid) to authenticated;
