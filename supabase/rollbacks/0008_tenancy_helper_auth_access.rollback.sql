-- Rollback for 0008: restore the auth.uid() bodies from 0003 and 0005 (which fail for signed-in
-- users through RLS, see 0008's header). Only use if 0008 itself causes a problem.
create or replace function app_private.is_studio_member(target_studio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.studio_member m
    where m.studio_id = target_studio and m.user_id = auth.uid());
$$;

create or replace function app_private.has_studio_role(target_studio uuid, roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.studio_member m
    where m.studio_id = target_studio and m.user_id = auth.uid() and m.role = any (roles));
$$;

create or replace function app_private.guardian_family_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select g.family_id from public.guardian g where g.user_id = auth.uid();
$$;

create or replace function app_private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.role = 'platform_admin');
$$;

drop function if exists app_private.current_user_id();
