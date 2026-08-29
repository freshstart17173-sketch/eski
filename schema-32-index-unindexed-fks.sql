-- schema-32 — migration p23_index_unindexed_fks (2026-08-29)
--
-- PERF fix found in the backend audit. The original schema's unindexed FKs were covered by
-- schema-09 (index_unindexed_fks), but three FK columns added by the later p4/p19 migrations
-- slipped through. An unindexed FK forces a full-table scan on the referenced row's
-- delete/update and on lookups by that column. Partial where the column is nullable (matches
-- the messages_work_id_idx style). After this the unindexed-FK audit returns zero rows.

-- messages.forwarded_from → messages(id) ON DELETE SET NULL: without this, deleting or
-- tombstoning ANY message scans messages for rows that forwarded it. Most messages aren't
-- forwards → partial index.
create index if not exists messages_forwarded_from_idx on messages(forwarded_from) where forwarded_from is not null;

-- join_requests.user_id: the jr_read policy filters "user_id = auth.uid()" (a user reading
-- their own requests); user_id is only the 2nd PK column so it has no leading-column index.
create index if not exists join_requests_user_idx on join_requests(user_id);

-- join_requests.decided_by → auth.users ON DELETE SET NULL: covers the user-delete cascade scan.
create index if not exists join_requests_decided_by_idx on join_requests(decided_by) where decided_by is not null;
