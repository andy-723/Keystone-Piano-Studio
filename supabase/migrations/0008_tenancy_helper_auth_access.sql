-- 0008: RLS helpers stop calling auth.uid() (expand; safe with the live code).
--
-- Found by the first CI run of the pgTAP tests (PR #27). The SECURITY DEFINER helpers owned by
-- tenancy_helper (0003, 0005) call auth.uid(), so they run as tenancy_helper, which has no USAGE
-- on schema auth. Any query by a signed-in user that reaches those policies fails with
-- "permission denied for schema auth". Server code using the service key bypasses RLS, which is
-- why the app has not shown it. The postgres role cannot grant USAGE on schema auth (it holds it
-- without grant option), so instead the helpers read the caller's id from the request JWT claims
-- the same way auth.uid() does, through app_private.current_user_id().
--
-- Owners stay tenancy_helper (CREATE OR REPLACE keeps the owner).

create or replace function app_private.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

revoke all on function app_private.current_user_id() from public, anon;
grant execute on function app_private.current_user_id() to tenancy_helper, authenticated, service_role;

create or replace function app_private.is_studio_member(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_member m
    where m.studio_id = target_studio
      and m.user_id = app_private.current_user_id()
  );
$$;

create or replace function app_private.has_studio_role(target_studio uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_member m
    where m.studio_id = target_studio
      and m.user_id = app_private.current_user_id()
      and m.role = any (roles)
  );
$$;

create or replace function app_private.guardian_family_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.family_id
  from public.guardian g
  where g.user_id = app_private.current_user_id();
$$;

create or replace function app_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_staff s
    where s.user_id = app_private.current_user_id()
      and s.role = 'platform_admin'
  );
$$;
