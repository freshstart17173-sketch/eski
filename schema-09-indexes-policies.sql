-- eski schema · 09 · P1 wrap — hardening, policy split, indexes  (CANON §E.7)
-- 1) set search_path on the two immutable perm helpers (advisor 0011)
-- 2) tighten anon EXECUTE to just can_read_work (the only gate helper anon evaluates
--    directly; the rest are called inside SECURITY DEFINER helpers as the owner, so
--    anon never needs EXECUTE on them) — shrinks the anon RPC surface
-- 3) split every FOR ALL write policy that coexists with a read policy into per-command
--    insert/update/delete policies — a FOR ALL policy also grants SELECT and ORs into
--    the read rule (advisor: multiple_permissive_policies; and the footgun that briefly
--    leaked private channels in group 4)
-- 4) add the FK + policy indexes the performance advisor flags, and the FTS GIN indexes

-- ── 1. immutable-helper search_path ─────────────────────────────────────────
create or replace function perm_bit(flag text) returns bigint
  language sql immutable set search_path = public as $$
  select case flag
    when 'manage_server' then 1::bigint when 'manage_roles' then 2 when 'manage_channels' then 4
    when 'manage_invites' then 8 when 'view_audit' then 16 when 'manage_billing' then 32
    when 'kick' then 64 when 'ban' then 128 when 'timeout' then 256 when 'create_invite' then 512
    when 'upload' then 1024 when 'add_tags' then 2048 when 'comment' then 4096
    when 'pin_message' then 8192 when 'delete_any_message' then 16384
    when 'view_channel' then 32768 when 'send_messages' then 65536
  end;
$$;
create or replace function everyone_perms() returns bigint language sql immutable set search_path = public as $$
  select perm_bit('upload') | perm_bit('add_tags') | perm_bit('comment')
       | perm_bit('pin_message') | perm_bit('send_messages') | perm_bit('view_channel');
$$;

-- ── 2. shrink the anon RPC surface ──────────────────────────────────────────
revoke execute on function
  member_of(uuid), is_server_admin(uuid), has_perm(uuid,bigint), perm_bit(text), everyone_perms(),
  can_write_work(uuid), dm_member(uuid), can_view_channel(uuid), can_view_message(uuid),
  can_post_channel(uuid), can_moderate_channel(uuid), can_interact_channel(uuid), is_friend(uuid)
  from anon;
-- can_read_work stays granted to anon (works_read/comment/tag policies evaluate it directly).

-- ── 3. split FOR ALL write policies → per-command ───────────────────────────
-- roles
drop policy if exists roles_write on roles;
create policy roles_ins on roles for insert with check (has_perm(server_id, perm_bit('manage_roles')));
create policy roles_upd on roles for update using (has_perm(server_id, perm_bit('manage_roles'))) with check (has_perm(server_id, perm_bit('manage_roles')));
create policy roles_del on roles for delete using (has_perm(server_id, perm_bit('manage_roles')));
-- member_roles
drop policy if exists mr_write on member_roles;
create policy mr_ins on member_roles for insert with check (has_perm(server_id, perm_bit('manage_roles')));
create policy mr_upd on member_roles for update using (has_perm(server_id, perm_bit('manage_roles'))) with check (has_perm(server_id, perm_bit('manage_roles')));
create policy mr_del on member_roles for delete using (has_perm(server_id, perm_bit('manage_roles')));
-- storage_balance
drop policy if exists sb_write on storage_balance;
create policy sb_ins on storage_balance for insert with check ((owner_type='user' and owner_id=(select auth.uid())) or (owner_type='server' and has_perm(owner_id, perm_bit('manage_billing'))));
create policy sb_upd on storage_balance for update using ((owner_type='user' and owner_id=(select auth.uid())) or (owner_type='server' and has_perm(owner_id, perm_bit('manage_billing')))) with check ((owner_type='user' and owner_id=(select auth.uid())) or (owner_type='server' and has_perm(owner_id, perm_bit('manage_billing'))));
create policy sb_del on storage_balance for delete using ((owner_type='user' and owner_id=(select auth.uid())) or (owner_type='server' and has_perm(owner_id, perm_bit('manage_billing'))));
-- folders (write = manage_channels; the locked/archived nuance is enforced on placement)
drop policy if exists folders_write on folders;
create policy folders_ins on folders for insert with check (has_perm(server_id, perm_bit('manage_channels')));
create policy folders_upd on folders for update using (has_perm(server_id, perm_bit('manage_channels'))) with check (has_perm(server_id, perm_bit('manage_channels')));
create policy folders_del on folders for delete using (has_perm(server_id, perm_bit('manage_channels')));
-- content_tags (author/admin or accepted collaborator)
drop policy if exists ct_write on content_tags;
create policy ct_ins on content_tags for insert with check (can_write_work(work_id) or exists (select 1 from work_collaborators c where c.work_id=content_tags.work_id and c.user_id=(select auth.uid()) and c.status='accepted'));
create policy ct_del on content_tags for delete using (can_write_work(work_id) or exists (select 1 from work_collaborators c where c.work_id=content_tags.work_id and c.user_id=(select auth.uid()) and c.status='accepted'));
-- work_items
drop policy if exists wi_write on work_items;
create policy wi_ins on work_items for insert with check (can_write_work(work_id));
create policy wi_upd on work_items for update using (can_write_work(work_id)) with check (can_write_work(work_id));
create policy wi_del on work_items for delete using (can_write_work(work_id));
-- share_links
drop policy if exists share_write on share_links;
create policy share_ins on share_links for insert with check (can_write_work(work_id));
create policy share_upd on share_links for update using (can_write_work(work_id)) with check (can_write_work(work_id));
create policy share_del on share_links for delete using (can_write_work(work_id));
-- channel_categories
drop policy if exists cc_write on channel_categories;
create policy cc_ins on channel_categories for insert with check (has_perm(server_id, perm_bit('manage_channels')));
create policy cc_upd on channel_categories for update using (has_perm(server_id, perm_bit('manage_channels'))) with check (has_perm(server_id, perm_bit('manage_channels')));
create policy cc_del on channel_categories for delete using (has_perm(server_id, perm_bit('manage_channels')));
-- channels
drop policy if exists ch_write on channels;
create policy ch_ins on channels for insert with check (has_perm(server_id, perm_bit('manage_channels')));
create policy ch_upd on channels for update using (has_perm(server_id, perm_bit('manage_channels'))) with check (has_perm(server_id, perm_bit('manage_channels')));
create policy ch_del on channels for delete using (has_perm(server_id, perm_bit('manage_channels')));
-- channel_roles
drop policy if exists cr_write on channel_roles;
create policy cr_ins on channel_roles for insert with check (exists (select 1 from channels c where c.id=channel_id and has_perm(c.server_id, perm_bit('manage_channels'))));
create policy cr_del on channel_roles for delete using (exists (select 1 from channels c where c.id=channel_id and has_perm(c.server_id, perm_bit('manage_channels'))));
-- message_reactions (own; insert requires interact)
drop policy if exists mr_react_write on message_reactions;
create policy mr_react_ins on message_reactions for insert with check (user_id=(select auth.uid()) and can_interact_channel((select channel_id from messages where id=message_id)));
create policy mr_react_del on message_reactions for delete using (user_id=(select auth.uid()));
-- dm_message_reactions (own; insert requires dm membership)
drop policy if exists dmr_write on dm_message_reactions;
create policy dmr_ins on dm_message_reactions for insert with check (user_id=(select auth.uid()) and dm_member((select dm_channel_id from dm_messages m where m.id=dm_message_id)));
create policy dmr_del on dm_message_reactions for delete using (user_id=(select auth.uid()));
-- server_bans
drop policy if exists ban_write on server_bans;
create policy ban_ins on server_bans for insert with check (is_server_admin(server_id) or has_perm(server_id, perm_bit('ban')));
create policy ban_upd on server_bans for update using (is_server_admin(server_id) or has_perm(server_id, perm_bit('ban'))) with check (is_server_admin(server_id) or has_perm(server_id, perm_bit('ban')));
create policy ban_del on server_bans for delete using (is_server_admin(server_id) or has_perm(server_id, perm_bit('ban')));

-- ── 4. FK / policy indexes (§E.7) ───────────────────────────────────────────
create index if not exists idx_servers_owner on servers(owner_id);
create index if not exists idx_sm_user on server_members(user_id);
create index if not exists idx_si_server on server_invites(server_id);
create index if not exists idx_si_creator on server_invites(created_by);
create index if not exists idx_roles_server on roles(server_id);
create index if not exists idx_mrole_user on member_roles(user_id);
create index if not exists idx_mrole_role on member_roles(role_id);
create index if not exists idx_crole_role on channel_roles(role_id);
create index if not exists idx_folders_server on folders(server_id);
create index if not exists idx_folders_parent on folders(parent_id);
create index if not exists idx_works_author on works(author_id);
create index if not exists idx_works_server on works(server_id);
create index if not exists idx_works_blob on works(blob_sha);
create index if not exists idx_works_owner on works(owner_type, owner_id);
create index if not exists idx_works_vis on works(visibility);
create index if not exists idx_witems_work on work_items(work_id);
create index if not exists idx_witems_blob on work_items(blob_sha);
create index if not exists idx_pl_work on placement(work_id);
create index if not exists idx_pl_folder on placement(folder_id);
create index if not exists idx_pl_channel on placement(channel_id);
create index if not exists idx_pl_surface on placement(surface, surface_id);
create index if not exists idx_pl_placedby on placement(placed_by);
create index if not exists idx_wcollab_user on work_collaborators(user_id);
create index if not exists idx_ctags_work on content_tags(work_id);
create index if not exists idx_star_work on starred_items(work_id);
create index if not exists idx_share_work on share_links(work_id);
create index if not exists idx_share_creator on share_links(created_by);
create index if not exists idx_ccat_server on channel_categories(server_id);
create index if not exists idx_chan_server on channels(server_id);
create index if not exists idx_chan_category on channels(category_id);
create index if not exists idx_chan_folder on channels(default_folder_id);
create index if not exists idx_msg_channel on messages(channel_id);
create index if not exists idx_msg_user on messages(user_id);
create index if not exists idx_msg_parent on messages(parent_id);
create index if not exists idx_mreact_user on message_reactions(user_id);
create index if not exists idx_pin_message on message_pins(message_id);
create index if not exists idx_pin_by on message_pins(pinned_by);
create index if not exists idx_reads_channel on channel_reads(channel_id);
create index if not exists idx_mentions_user on mentions(mentioned_user);
create index if not exists idx_mentions_server on mentions(server_id);
create index if not exists idx_cmt_work on comments(work_id);
create index if not exists idx_cmt_user on comments(user_id);
create index if not exists idx_cmt_parent on comments(parent_id);
create index if not exists idx_savef_user on save_folders(user_id);
create index if not exists idx_savef_parent on save_folders(parent_id);
create index if not exists idx_saved_work on saved_items(work_id);
create index if not exists idx_saved_folder on saved_items(folder_id);
create index if not exists idx_notif_user_read on notifications(user_id, read_at);
create index if not exists idx_notif_actor on notifications(actor_id);
create index if not exists idx_notif_server on notifications(server_id);
create index if not exists idx_sprefs_server on server_prefs(server_id);
create index if not exists idx_cprefs_channel on channel_prefs(channel_id);
create index if not exists idx_fr_b on friendships(b_user);
create index if not exists idx_fr_reqby on friendships(requested_by);
create index if not exists idx_dmm_user on dm_members(user_id);
create index if not exists idx_dmsg_channel on dm_messages(dm_channel_id);
create index if not exists idx_dmsg_user on dm_messages(user_id);
create index if not exists idx_dmsg_parent on dm_messages(parent_id);
create index if not exists idx_dmreact_user on dm_message_reactions(user_id);
create index if not exists idx_ban_user on server_bans(user_id);
create index if not exists idx_ban_by on server_bans(banned_by);
create index if not exists idx_rep_reporter on reports(reporter_id);
create index if not exists idx_rep_server on reports(server_id);
create index if not exists idx_audit_server on audit_log(server_id);
create index if not exists idx_audit_actor on audit_log(actor_id);
create index if not exists idx_inv_owner on invoices(owner_type, owner_id);
create index if not exists idx_sess_user on sessions(user_id);

-- FTS GIN (§E.7): messages.body_tsv is populated; works.search_tsv fills via the P2 trigger.
create index if not exists idx_msg_tsv on messages using gin(body_tsv);
create index if not exists idx_works_tsv on works using gin(search_tsv);
