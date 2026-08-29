-- schema-22-unify-private-visibility.sql — one name for one concept.
-- Applied as migration p12_unify_private_visibility (2026-08-29).
--
-- "Private" (the UI label) and 'personal' (the DB value) were the SAME visibility level under
-- two names — the CANON "one name per concept" violation that made every private upload fail
-- (the upload sheet sent the UI word 'private', which the check constraint rejected). The value
-- is now 'private' everywhere; 'personal' stays accepted only as a legacy alias until a later
-- migration drops it (kept for a zero-downtime frontend deploy). Safe: can_read_work never
-- branches on the word — any non-public/non-server visibility is owner-only — so 'private'
-- behaves identically. Zero 'personal' rows existed, so nothing to backfill.
alter table public.works drop constraint works_visibility_check;
alter table public.works add constraint works_visibility_check
  check (visibility = any (array['public'::text, 'personal'::text, 'private'::text, 'server'::text]));
