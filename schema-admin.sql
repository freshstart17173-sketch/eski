-- eski: the admin gate.
-- Applied to project zidqagrmxeawpasurpwi. Safe to re-run.
--
-- THE GATE IS HERE, NOT IN THE BROWSER. admin.html has no powers of its own:
-- it can only do what these policies already allow the signed-in account to
-- do. A page that merely hides its buttons is not a gate — anyone can open
-- the console and issue the same queries.
--
-- Membership is granted in SQL only. There is deliberately no policy that
-- allows writing to `admins`, so no ui anywhere can promote anyone.
--
--   insert into admins (user_id, note)
--   select id, 'why' from auth.users where email = 'you@example.com';

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- you may see whether YOU are an admin, and nothing else: the membership
-- list is not public.
drop policy if exists admins_read_self on public.admins;
create policy admins_read_self on public.admins for select
  using (user_id = auth.uid());

-- security definer so a policy can call it without recursing into admins' rls
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated, anon;

-- ---------------------------------------------------------------- powers
create policy comics_admin_read   on public.comics   for select using (public.is_admin());
create policy comics_admin_write  on public.comics   for update using (public.is_admin())
                                                     with check (public.is_admin());
create policy comics_admin_delete on public.comics   for delete using (public.is_admin());

create policy comments_admin_read   on public.comments for select using (public.is_admin());
create policy comments_admin_write  on public.comments for update using (public.is_admin())
                                                       with check (public.is_admin());
create policy comments_admin_delete on public.comments for delete using (public.is_admin());

create policy reports_admin_read  on public.reports for select using (public.is_admin());
create policy reports_admin_write on public.reports for update using (public.is_admin())
                                                    with check (public.is_admin());

create policy parts_admin_read   on public.parts for select using (public.is_admin());
create policy parts_admin_write  on public.parts for update using (public.is_admin())
                                                 with check (public.is_admin());
create policy parts_admin_delete on public.parts for delete using (public.is_admin());

-- ---------------------------------------------------------------- windows
-- auth.users is not exposed to PostgREST and should not be. These two are the
-- only way in, and both check is_admin() INSIDE the function: a security
-- definer function bypasses rls, so without that check this would be a public
-- dump of every email on the site.
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return json_build_object(
    'users',      (select count(*) from auth.users),
    'comics',     (select count(*) from public.comics),
    'published',  (select count(*) from public.comics where status = 'published'),
    'drafts',     (select count(*) from public.comics where status <> 'published'),
    'pages',      (select count(*) from public.pages),
    'tracks',     (select count(*) from public.tracks),
    'parts',      (select count(*) from public.parts),
    'comments',   (select count(*) from public.comments where deleted_at is null),
    'removed',    (select count(*) from public.comments where deleted_at is not null),
    'kudos',      (select count(*) from public.kudos),
    'saves',      (select count(*) from public.saves),
    'reports',    (select count(*) from public.reports where status = 'open'),
    'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days')
  );
end $$;

create or replace function public.admin_users(p_limit int default 200)
returns table(
  id uuid, email text, name text, handle text,
  created_at timestamptz, last_sign_in_at timestamptz,
  comics bigint, comments bigint, is_admin boolean
) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text,
           coalesce(nullif(btrim(p.display_name), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    split_part(coalesce(u.email, ''), '@', 1))::text,
           p.handle::text, u.created_at, u.last_sign_in_at,
           (select count(*) from public.comics c where c.owner_id = u.id),
           (select count(*) from public.comments m where m.user_id = u.id and m.deleted_at is null),
           exists (select 1 from public.admins a where a.user_id = u.id)
      from auth.users u
      left join public.profiles p on p.id = u.id
     order by u.created_at desc
     limit greatest(1, least(p_limit, 1000));
end $$;

revoke execute on function public.admin_overview() from anon;
revoke execute on function public.admin_users(int) from anon;
grant  execute on function public.admin_overview() to authenticated;
grant  execute on function public.admin_users(int) to authenticated;

-- ------------------------------------------------------------------ verify
select proname from pg_proc
where proname in ('is_admin','admin_overview','admin_users') order by proname;
