-- eski schema · 14 · P2 triggers  (P2.13–P2.15)
-- Re-runnable. Triggers that WRITE side tables (mentions, notifications, meters, blob
-- refcounts) are SECURITY DEFINER to bypass the RLS that would block those inserts;
-- the row-shaping ones (edit/tombstone, search_tsv) run as invoker (touch NEW only).

-- shared @handle extractor (2–32 word chars after @). distinct; case folded downstream.
create or replace function extract_handles(txt text) returns setof text
  language sql immutable set search_path = public as $$
  select distinct m[1] from regexp_matches(coalesce(txt, ''), '@([A-Za-z0-9_]{2,32})', 'g') m;
$$;

-- ── P2.13 · message fan-out → mentions + notifications ──────────────────────
create or replace function messages_fanout() returns trigger
  language plpgsql security definer set search_path = public as $$
declare sid uuid; h text; muid uuid;
begin
  select server_id into sid from channels where id = NEW.channel_id;
  for h in select * from extract_handles(NEW.body) loop
    select id into muid from profiles p where lower(p.handle) = lower(h);
    if muid is not null and muid <> NEW.user_id
       and exists (select 1 from server_members m where m.server_id = sid and m.user_id = muid and m.status = 'active') then
      insert into mentions (message_id, mentioned_user, server_id)
        values (NEW.id, muid, sid) on conflict do nothing;
      insert into notifications (user_id, kind, actor_id, server_id, target_type, target_id, excerpt)
        values (muid, 'mention', NEW.user_id, sid, 'message', NEW.id, left(coalesce(NEW.body, ''), 140));
    end if;
  end loop;
  return NEW;
  -- NOTE: also_to_channel is a read-time surfacing flag (a thread reply also shown in
  -- the main timeline); it needs no extra row, so the fan-out is mentions/notifications.
end;
$$;
drop trigger if exists trg_messages_fanout on messages;
create trigger trg_messages_fanout after insert on messages
  for each row execute function messages_fanout();

-- ── P2.14 · edit / tombstone (messages + dm_messages) ───────────────────────
create or replace function msg_edit_tombstone() returns trigger
  language plpgsql set search_path = public as $$
begin
  if NEW.deleted_at is not null and OLD.deleted_at is null then
    NEW.body := null;                       -- tombstone: keep the row, drop the text
  elsif NEW.body is distinct from OLD.body then
    NEW.edited_at := now();
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_messages_edit on messages;
create trigger trg_messages_edit before update on messages
  for each row execute function msg_edit_tombstone();
drop trigger if exists trg_dm_messages_edit on dm_messages;
create trigger trg_dm_messages_edit before update on dm_messages
  for each row execute function msg_edit_tombstone();

-- ── P2.14 · works search_tsv (+ auto-hide / approval hold on insert) ────────
create or replace function works_before_write() returns trigger
  language plpgsql set search_path = public as $$
begin
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.kind, '') || ' ' || coalesce(NEW.file_ext, ''));
  if TG_OP = 'INSERT' and NEW.server_id is not null then
    if exists (select 1 from servers s where s.id = NEW.server_id and s.hide_posts_by_default)
       or exists (select 1 from member_roles mr join roles r on r.id = mr.role_id
                  where mr.server_id = NEW.server_id and mr.user_id = NEW.author_id and r.hide_posts_by_default) then
      NEW.hidden := true;
    end if;
    if exists (select 1 from server_members m
               where m.server_id = NEW.server_id and m.user_id = NEW.author_id and m.posts_require_approval) then
      NEW.approved_at := null;
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_works_before_write on works;
create trigger trg_works_before_write before insert or update on works
  for each row execute function works_before_write();

-- ── P2.14 · comment mention → notification ──────────────────────────────────
create or replace function comments_fanout() returns trigger
  language plpgsql security definer set search_path = public as $$
declare h text; muid uuid;
begin
  for h in select * from extract_handles(NEW.body) loop
    select id into muid from profiles p where lower(p.handle) = lower(h);
    if muid is not null and muid <> NEW.user_id then
      insert into notifications (user_id, kind, actor_id, server_id, target_type, target_id, excerpt)
        values (muid, 'comment', NEW.user_id, null, 'comment', NEW.id, left(coalesce(NEW.body, ''), 140));
    end if;
  end loop;
  return NEW;
end;
$$;
drop trigger if exists trg_comments_fanout on comments;
create trigger trg_comments_fanout after insert on comments
  for each row execute function comments_fanout();

-- ── P2.15 · storage meter + blob refcount (dedup) ───────────────────────────
-- A meter counts DISTINCT owned blobs: bytes enter when an owner FIRST references a
-- blob and leave when the owner's LAST reference goes. media_blobs.refcount is the
-- global reference count (GC-eligible at 0).
create or replace function meter_bump(otype text, oid uuid, delta bigint) returns void
  language sql security definer set search_path = public as $$
  insert into storage_meters (owner_type, owner_id, bytes_used, updated_at)
  values (otype, oid, greatest(delta, 0), now())
  on conflict (owner_type, owner_id)
    do update set bytes_used = greatest(storage_meters.bytes_used + delta, 0), updated_at = now();
$$;

create or replace function works_blob_meter() returns trigger
  language plpgsql security definer set search_path = public as $$
declare b bigint;
begin
  if TG_OP = 'INSERT' then
    if NEW.blob_sha is not null then
      update media_blobs set refcount = refcount + 1 where sha256 = NEW.blob_sha;
      if not exists (select 1 from works w where w.id <> NEW.id and w.blob_sha = NEW.blob_sha
                     and w.owner_type = NEW.owner_type and w.owner_id = NEW.owner_id) then
        select bytes into b from media_blobs where sha256 = NEW.blob_sha;
        perform meter_bump(NEW.owner_type, NEW.owner_id, b);
      end if;
    end if;
    return NEW;

  elsif TG_OP = 'DELETE' then
    if OLD.blob_sha is not null then
      update media_blobs set refcount = greatest(refcount - 1, 0) where sha256 = OLD.blob_sha;
      if not exists (select 1 from works w where w.blob_sha = OLD.blob_sha
                     and w.owner_type = OLD.owner_type and w.owner_id = OLD.owner_id) then
        select bytes into b from media_blobs where sha256 = OLD.blob_sha;
        perform meter_bump(OLD.owner_type, OLD.owner_id, -b);
      end if;
    end if;
    return OLD;

  else  -- UPDATE: only when the blob or the owning account changed
    if OLD.blob_sha is distinct from NEW.blob_sha
       or OLD.owner_type is distinct from NEW.owner_type
       or OLD.owner_id  is distinct from NEW.owner_id then
      if OLD.blob_sha is not null then
        update media_blobs set refcount = greatest(refcount - 1, 0) where sha256 = OLD.blob_sha;
        if not exists (select 1 from works w where w.id <> NEW.id and w.blob_sha = OLD.blob_sha
                       and w.owner_type = OLD.owner_type and w.owner_id = OLD.owner_id) then
          select bytes into b from media_blobs where sha256 = OLD.blob_sha;
          perform meter_bump(OLD.owner_type, OLD.owner_id, -b);
        end if;
      end if;
      if NEW.blob_sha is not null then
        update media_blobs set refcount = refcount + 1 where sha256 = NEW.blob_sha;
        if not exists (select 1 from works w where w.id <> NEW.id and w.blob_sha = NEW.blob_sha
                       and w.owner_type = NEW.owner_type and w.owner_id = NEW.owner_id) then
          select bytes into b from media_blobs where sha256 = NEW.blob_sha;
          perform meter_bump(NEW.owner_type, NEW.owner_id, b);
        end if;
      end if;
    end if;
    return NEW;
  end if;
end;
$$;
drop trigger if exists trg_works_blob_meter on works;
create trigger trg_works_blob_meter after insert or update or delete on works
  for each row execute function works_blob_meter();

grant execute on function extract_handles(text) to authenticated;

-- Internal-only: trigger functions + the meter helper must never be REST-callable.
-- Triggers fire regardless of the invoker's EXECUTE, and the definer triggers own
-- meter_bump, so revoking these breaks nothing and keeps them out of the exposed API.
revoke execute on function meter_bump(text, uuid, bigint) from public, anon, authenticated;
revoke execute on function works_blob_meter()   from public, anon, authenticated;
revoke execute on function messages_fanout()    from public, anon, authenticated;
revoke execute on function comments_fanout()    from public, anon, authenticated;
revoke execute on function works_before_write()  from public, anon, authenticated;
revoke execute on function msg_edit_tombstone()  from public, anon, authenticated;
