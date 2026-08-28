-- schema-20-perf-indexes.sql — perf cleanup from the 2026-08-28 advisor pass.
-- Applied as migration `p11_drop_duplicate_indexes`.
--
-- The performance advisor flagged two identical index pairs. A duplicate index costs write
-- time and storage for no read benefit (the planner only ever uses one). Keep the
-- search-named index of each pair, drop the redundant twin.
drop index if exists public.idx_msg_tsv;      -- identical to idx_messages_body_tsv on messages
drop index if exists public.idx_works_tsv;     -- identical to idx_works_search_tsv on works
