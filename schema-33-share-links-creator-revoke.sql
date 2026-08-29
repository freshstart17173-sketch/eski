-- schema-33 — migration p24_share_links_creator_can_revoke (2026-08-29)
--
-- BUG found in the frontend data-layer audit. share_links gained folder-share targets in
-- schema-29 (work_id nullable, folder_id/folder_source set). The SELECT policy (share_read)
-- already allows the creator: `created_by = auth.uid() OR can_write_work(work_id)`. But the
-- UPDATE (share_upd) and DELETE (share_del) policies gate ONLY on can_write_work(work_id) —
-- which is FALSE for a folder share (work_id is null, can_write_work(null) = false). Net: a
-- folder-share creator can SEE their link but can NEVER revoke it (a direct update matches 0
-- rows with NO error — a silent no-op), and resolve_folder_share honors a revoked_at that
-- nothing can set. Verified by role-sim: pre-fix revoke rows_updated = 0 while the row is
-- visible; post-fix rows_updated = 1 and the resolver then refuses the revoked share.
--
-- Fix: align UPDATE + DELETE with SELECT — the creator can always revoke/delete a link they
-- made (work OR folder); a work-writer keeps their existing power. Safe: you can already read
-- a link you created, so being able to revoke your own is strictly expected.
alter policy share_upd on share_links
  using ((created_by = (select auth.uid())) or can_write_work(work_id))
  with check ((created_by = (select auth.uid())) or can_write_work(work_id));
alter policy share_del on share_links
  using ((created_by = (select auth.uid())) or can_write_work(work_id));
