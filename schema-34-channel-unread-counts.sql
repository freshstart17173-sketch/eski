-- schema-34 · P19 channel unread counts (migration "p25_channel_unread_counts")
-- Per-channel unread counts for the calling user, one round-trip per server. Drives the
-- unread dot + bold name on channel rows (app/screens/workspace.js channelColumn), computed
-- in app/data.js loadWorkspace.
--
-- unread = top-level, non-deleted messages NOT authored by me, newer than my
-- channel_reads.last_read_at (or ALL of them if I've never opened the channel). Only channels
-- I can view are returned (can_view_channel gate), so it's safe to grant to authenticated.
-- STABLE read; SECURITY DEFINER only to keep the per-row can_view_channel + channel_reads
-- lookups uniform with the rest of the message RPCs — the WHERE still restricts to the caller's
-- own reads, so it leaks nothing.

create or replace function channel_unread_counts(p_server uuid)
  returns table(channel_id uuid, unread integer)
  language sql security definer set search_path = public stable as $$
  select c.id,
         (select count(*)
            from messages m
           where m.channel_id = c.id
             and m.parent_id is null
             and m.deleted_at is null
             and m.user_id <> (select auth.uid())
             and m.created_at > coalesce(
                   (select r.last_read_at from channel_reads r
                     where r.user_id = (select auth.uid()) and r.channel_id = c.id),
                   'epoch'::timestamptz))::int
    from channels c
   where c.server_id = p_server
     and c.kind <> 'voice'
     and can_view_channel(c.id);
$$;

revoke all on function channel_unread_counts(uuid) from public;
grant execute on function channel_unread_counts(uuid) to authenticated;
