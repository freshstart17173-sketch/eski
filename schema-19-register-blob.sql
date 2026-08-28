-- schema-19-register-blob.sql — the missing step in the upload write path.
-- Applied to project zidqagrmxeawpasurpwi as migration `p10_register_blob` (2026-08-28).
--
-- BUG (owner test 2026-08-28): every file upload failed silently. `works.blob_sha` has a
-- FK to `media_blobs.sha256`, but `media_blobs` is RLS-enabled with NO write policy, and
-- neither the signer (api/sign.mjs) nor the client ever created the row — so the works
-- insert always violated the FK. (Profile photos worked because `profiles.avatar_key`
-- has no such FK.) The `works_blob_meter` trigger even assumed the row already existed.
--
-- FIX: a SECURITY DEFINER RPC the client calls right after the R2 PUT and before the
-- works insert, so the FK is satisfiable and the meter trigger can read the byte size.
-- refcount starts at 0; works_blob_meter bumps it to 1 on the works insert. Content-
-- addressed, so a repeated sha is a no-op (keeps the existing refcount).
--
-- TRUST: the caller asserts `bytes` (client-known), the same trust surface as the signer's
-- "we don't verify the uploaded bytes hash to the key" note — acceptable pre-billing. A
-- hardened version would set bytes from an R2 HEAD of the object. bytes is clamped >= 0.

create or replace function public.register_blob(p_sha text, p_bytes bigint)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into media_blobs (sha256, bytes, refcount)
  values (lower(p_sha), greatest(coalesce(p_bytes, 0), 0), 0)
  on conflict (sha256) do nothing;
$$;

revoke all on function public.register_blob(text, bigint) from public;
grant execute on function public.register_blob(text, bigint) to authenticated;
