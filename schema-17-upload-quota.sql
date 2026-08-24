-- eski schema · 17 · upload quota (P5.12)  — migration: p5_upload_quota
-- The signer (api/sign.mjs) calls rpc/claim_upload_quota({n}) before signing any R2
-- PUT and FAILS CLOSED if it's absent. The retired product's schema-quota.sql was
-- dropped by the clean slate, so this restores the ceiling for the new schema.
--
-- This is the daily OBJECT-COUNT anti-abuse cap (500/user/UTC-day) — distinct from
-- the GB storage meter (storage_meters + the works_blob_meter trigger, schema-14).

create table if not exists upload_quota (
  user_id uuid not null,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table upload_quota enable row level security;
-- No policies by design: written ONLY by the security-definer RPC (so a caller can't
-- reset their own tally) and never read directly by the client.

create or replace function claim_upload_quota(n integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'utc')::date;
  cap constant integer := 500;   -- objects per user per UTC day
  new_count integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'used', 0, 'cap', cap);
  end if;
  if n is null or n < 1 or n > 500 then
    return jsonb_build_object('ok', false, 'used', 0, 'cap', cap);
  end if;
  insert into upload_quota (user_id, day, count)
    values (uid, today, n)
  on conflict (user_id, day) do update set count = upload_quota.count + excluded.count
  returning count into new_count;
  if new_count > cap then
    update upload_quota set count = count - n where user_id = uid and day = today;  -- refund the refused claim
    return jsonb_build_object('ok', false, 'used', new_count - n, 'cap', cap);
  end if;
  return jsonb_build_object('ok', true, 'used', new_count, 'cap', cap);
end;
$$;

revoke all on function claim_upload_quota(integer) from public, anon;
grant execute on function claim_upload_quota(integer) to authenticated;
