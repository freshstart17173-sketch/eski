-- The account tests/live.js signs in as. Run once, in the Supabase SQL editor.
--
-- THERE IS NO GUEST MODE, and this is why there does not need to be one.
-- Publishing writes a comics row owned by auth.uid() and asks /api/sign for an
-- upload url against a real access token, so nothing client-side can stand in
-- for a session — and a server-side path that did would be an unauthenticated
-- write into the bucket and onto the shelf, which is exactly the hole item 2
-- of ROADMAP.md is about closing. So the harness uses an ordinary account with
-- no powers a signed-up reader does not have, and production ships no bypass.
--
-- Anonymous sign-ins would do the same job with no stored password. They are
-- disabled for this project; if they are ever turned on, prefer them and drop
-- this file.
--
-- Change the password before running, and set ESKI_TEST_PASSWORD to match.

do $$
declare uid uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'harness@eski.test') then
    raise notice 'harness account already exists';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    'harness@eski.test',
    extensions.crypt('eski-harness-2026', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Harness"}'::jsonb,
    '', '', '', '');

  -- gotrue will not accept a password sign-in without the matching identity row
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    uid::text, uid,
    format('{"sub":"%s","email":"harness@eski.test","email_verified":true}', uid)::jsonb,
    'email', now(), now(), now());
end $$;

select id, email, email_confirmed_at from auth.users where email = 'harness@eski.test';

-- To remove it again, along with everything it published:
--   delete from auth.users where email = 'harness@eski.test';
