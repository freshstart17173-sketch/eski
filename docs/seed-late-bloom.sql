-- seed-late-bloom.sql — the "Late Bloom LP" demo server for the PREVIEW project.
--
-- Applied to Supabase project zidqagrmxeawpasurpwi on 2026-08-23 (owner-requested)
-- so P4 Realtime (P4.10/P4.11) can be built + tested against real data with the two
-- real accounts. Re-runnable: it clears its own rows first (fixed UUIDs).
--
-- Accounts pre-created here (magic-link OTP reconciles an existing user by email on
-- first sign-in, so these can sign in normally):
--   dexterekayu@gmail.com    → owner / admin   (real)
--   freshstart17173@gmail.com → member          (real)
--   rae@ / dev@ / tomo@seed.eski.lol → demo authors, never sign in (delete anytime)
--
-- NOT for production. When a real Create-Server flow (P9) exists, servers are made
-- through the app; this is scaffolding for the beta preview only. To remove:
--   delete from public.servers where id='11111111-1111-1111-1111-111111111111';
--   delete from auth.users where email in
--     ('dexterekayu@gmail.com','freshstart17173@gmail.com','rae@seed.eski.lol','dev@seed.eski.lol','tomo@seed.eski.lol');

do $seed$
declare
  u_dex uuid := '0de00000-0000-4000-8000-000000000001';
  u_fs  uuid := '0f000000-0000-4000-8000-000000000002';
  u_rae uuid := '0a000000-0000-4000-8000-000000000003';
  u_dev uuid := '0d000000-0000-4000-8000-000000000004';
  u_tom uuid := '07000000-0000-4000-8000-000000000005';
  s_id  uuid := '11111111-1111-1111-1111-111111111111';
  r_eve uuid := '20000000-0000-4000-8000-0000000000e0';
  r_adm uuid := '20000000-0000-4000-8000-0000000000ad';
  c_ann uuid := 'c0000000-0000-4000-8000-000000000001';
  c_bea uuid := 'c0000000-0000-4000-8000-000000000002';
  c_ver uuid := 'c0000000-0000-4000-8000-000000000003';
  c_mix uuid := 'c0000000-0000-4000-8000-000000000004';
  c_ref uuid := 'c0000000-0000-4000-8000-000000000005';
  c_ste uuid := 'c0000000-0000-4000-8000-000000000006';
  c_boo uuid := 'c0000000-0000-4000-8000-000000000007';
  c_cow uuid := 'c0000000-0000-4000-8000-000000000008';
  m1 uuid := 'a1000000-0000-4000-8000-000000000001';
begin
  delete from public.servers where id = s_id;
  delete from auth.users where id in (u_dex,u_fs,u_rae,u_dev,u_tom);

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', u_dex, 'authenticated','authenticated','dexterekayu@gmail.com', null, now(), now(), now(), '{"provider":"email","providers":["email"]}','{}','','','',''),
    ('00000000-0000-0000-0000-000000000000', u_fs,  'authenticated','authenticated','freshstart17173@gmail.com', null, now(), now(), now(), '{"provider":"email","providers":["email"]}','{}','','','',''),
    ('00000000-0000-0000-0000-000000000000', u_rae, 'authenticated','authenticated','rae@seed.eski.lol', null, now(), now(), now(), '{"provider":"email","providers":["email"]}','{}','','','',''),
    ('00000000-0000-0000-0000-000000000000', u_dev, 'authenticated','authenticated','dev@seed.eski.lol', null, now(), now(), now(), '{"provider":"email","providers":["email"]}','{}','','','',''),
    ('00000000-0000-0000-0000-000000000000', u_tom, 'authenticated','authenticated','tomo@seed.eski.lol', null, now(), now(), now(), '{"provider":"email","providers":["email"]}','{}','','','','');

  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', false), 'email', now(), now()
  from auth.users where id in (u_dex,u_fs,u_rae,u_dev,u_tom);

  insert into public.profiles (id, handle, name, presence_state, status_text) values
    (u_dex,'dexter','dexter','online','arranging, Ableton'),
    (u_fs, 'freshstart','freshstart','online','listening back'),
    (u_rae,'rae','rae','online','recording'),
    (u_dev,'dev','dev','online','in FL Studio'),
    (u_tom,'tomo','tomo','online','reviewing the beat');

  insert into public.servers (id, name, slug, description, owner_id)
  values (s_id, 'Late Bloom LP', 'late-bloom-lp', 'the record. put the session name in the file name.', u_dex);

  insert into public.roles (id, server_id, name, permissions, is_default, position) values
    (r_eve, s_id, '@everyone', everyone_perms(), true, 0),
    (r_adm, s_id, 'Admin',
      everyone_perms() | perm_bit('manage_server') | perm_bit('manage_roles') | perm_bit('manage_channels')
      | perm_bit('manage_invites') | perm_bit('kick') | perm_bit('ban') | perm_bit('timeout'),
      false, 10);

  insert into public.server_members (server_id, user_id, color, status) values
    (s_id, u_dex, 5, 'active'),
    (s_id, u_fs, 12, 'active'),
    (s_id, u_rae, 1, 'active'),
    (s_id, u_dev, 3, 'active'),
    (s_id, u_tom, 2, 'active');

  insert into public.member_roles (server_id, user_id, role_id)
  select s_id, uid, r_eve from unnest(array[u_dex,u_fs,u_rae,u_dev,u_tom]) uid;
  insert into public.member_roles (server_id, user_id, role_id) values (s_id, u_rae, r_adm);

  insert into public.channels (id, server_id, name, kind, position) values
    (c_ann, s_id, 'announcements','text',0),
    (c_bea, s_id, 'beats','text',1),
    (c_ver, s_id, 'verses','text',2),
    (c_mix, s_id, 'mixing','text',3),
    (c_ref, s_id, 'references','text',4),
    (c_ste, s_id, 'stems and sessions','text',5),
    (c_boo, s_id, 'the booth','voice',6),
    (c_cow, s_id, 'co-writing','voice',7);

  insert into public.messages (id, channel_id, user_id, body, parent_id, edited_at, created_at) values
    (m1, c_bea, u_dev, 'reworked the back half. same bpm, swapped the drums to the ones @rae liked', null, null, now() - interval '40 min'),
    (gen_random_uuid(), c_bea, u_rae, 'low end''s a bit much on the bridge, otherwise this is the one', m1, null, now() - interval '36 min'),
    (gen_random_uuid(), c_bea, u_dex, 'agreed. @tomo can you pull it down a couple db and bounce a rough?', m1, null, now() - interval '32 min'),
    (gen_random_uuid(), c_bea, u_tom, 'on it, pushing a new bounce in a sec', m1, null, now() - interval '28 min'),
    (gen_random_uuid(), c_bea, u_dev, 'dropped the whole one-shot pack, grab what you want', null, null, now() - interval '24 min'),
    (gen_random_uuid(), c_bea, u_rae, 'this is the one. pulling it into #mixing, dropping a scratch verse now', null, now() - interval '16 min', now() - interval '17 min'),
    (gen_random_uuid(), c_bea, u_dex, 'session is Fri 3pm. bring stems bounced at 24/48, not the project files.', null, null, now() - interval '12 min'),
    (gen_random_uuid(), c_bea, u_fs,  'just pulled the latest — this actually slaps. nice work', null, null, now() - interval '6 min'),
    (gen_random_uuid(), c_bea, u_tom, 'opened dev''s stems fine in ableton. one note on the low end, dropped a comment on the bounce', null, null, now() - interval '3 min');
end
$seed$;
