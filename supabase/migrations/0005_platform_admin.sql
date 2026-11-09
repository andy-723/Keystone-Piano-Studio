-- Platform admin (0005). Local rehearsal only — do not apply to production until Andrew reviews.
-- Platform staff are NOT studio members and get NO access to studio data (families, students,
-- invoices, chat). ADR-019 (support access through an owner-approved, time-limited, logged grant)
-- is still proposed and is out of scope here.

-- ---------------------------------------------------------------------------
-- platform_staff
-- ---------------------------------------------------------------------------
create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('platform_admin', 'support')),
  display_name text not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id)
);

alter table public.platform_staff enable row level security;

revoke all on table public.platform_staff from anon;
revoke all on table public.platform_staff from public;

-- Idempotent: same hosted Supabase grants as 0003 (safe if already applied).
grant tenancy_helper to postgres;
grant usage, create on schema app_private to tenancy_helper;

-- tenancy_helper may read (user_id, role) for is_platform_admin()
grant select (user_id, role) on table public.platform_staff to tenancy_helper;

drop policy if exists tenancy_helper_platform_staff_select on public.platform_staff;
create policy tenancy_helper_platform_staff_select on public.platform_staff
  for select to tenancy_helper using (true);

-- ---------------------------------------------------------------------------
-- app_private.is_platform_admin() — before policies that call it
-- ---------------------------------------------------------------------------
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
    where s.user_id = auth.uid()
      and s.role = 'platform_admin'
  );
$$;

alter function app_private.is_platform_admin() owner to tenancy_helper;

revoke all on function app_private.is_platform_admin() from public, anon;
grant execute on function app_private.is_platform_admin() to authenticated;

-- Authenticated may SELECT own row or any row when platform admin, and only at aal2.
-- No INSERT / UPDATE / DELETE through the API (service role only).
drop policy if exists platform_staff_select on public.platform_staff;
create policy platform_staff_select on public.platform_staff
  for select to authenticated
  using (
    (auth.jwt() ->> 'aal') = 'aal2'
    and (
      user_id = auth.uid()
      or app_private.is_platform_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- platform_audit (append-only)
-- ---------------------------------------------------------------------------
create table public.platform_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  event text not null check (event in (
    'bootstrap_admin',
    'sign_in',
    'sign_in_no_account',
    'mfa_enrolled',
    'mfa_reset',
    'studio_created',
    'owner_invited',
    'staff_added',
    'staff_removed'
  )),
  target_studio_id uuid null references public.studio(id) on delete set null,
  target_user_id uuid null,
  detail jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  at timestamptz not null default now()
);

alter table public.platform_audit enable row level security;

revoke all on table public.platform_audit from anon;
revoke all on table public.platform_audit from public;

drop policy if exists platform_audit_admin_select on public.platform_audit;
create policy platform_audit_admin_select on public.platform_audit
  for select to authenticated
  using (
    (auth.jwt() ->> 'aal') = 'aal2'
    and app_private.is_platform_admin()
  );

-- No INSERT/UPDATE/DELETE policies for authenticated — service-role server code only.
-- Append-only trigger: raise on UPDATE or DELETE for any non-owner role.
create or replace function app_private.platform_audit_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'platform_audit is append-only';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists platform_audit_append_only on public.platform_audit;
create trigger platform_audit_append_only
  before update or delete on public.platform_audit
  for each row execute function app_private.platform_audit_append_only();

-- ---------------------------------------------------------------------------
-- app_private.create_studio_with_owner — service_role only
-- ---------------------------------------------------------------------------
create or replace function app_private.create_studio_with_owner(
  p_name text,
  p_timezone text,
  p_owner_user_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_studio_id uuid;
begin
  insert into public.studio (name, timezone, owner_user_id)
  values (p_name, p_timezone, p_owner_user_id)
  returning id into new_studio_id;

  insert into public.studio_member (studio_id, user_id, role)
  values (new_studio_id, p_owner_user_id, 'owner');

  insert into public.platform_audit (actor_user_id, event, target_studio_id, target_user_id, detail)
  values (
    p_actor,
    'studio_created',
    new_studio_id,
    p_owner_user_id,
    jsonb_build_object('name', p_name, 'timezone', p_timezone)
  );

  return new_studio_id;
end;
$$;

revoke all on function app_private.create_studio_with_owner(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.create_studio_with_owner(text, text, uuid, uuid) to service_role;

-- Thin public wrapper so the service client can call it via rpc(); still service_role only.
create or replace function public.create_studio_with_owner(
  p_name text,
  p_timezone text,
  p_owner_user_id uuid,
  p_actor uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app_private.create_studio_with_owner(p_name, p_timezone, p_owner_user_id, p_actor);
$$;

revoke all on function public.create_studio_with_owner(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_studio_with_owner(text, text, uuid, uuid) to service_role;
