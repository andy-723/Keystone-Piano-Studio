-- Studio subscription and access (0006). Local rehearsal only — do not apply to production until Andrew reviews.
--
-- One subscription per studio (flat price, not per teacher — Andrew, 9 Nov 2026). Everyone in the
-- studio (owner, admins, teachers, guardians) inherits the studio's access. Nobody gets a
-- billing token of their own; Supabase session JWTs stay as they are.
--
-- Access levels (app_private.studio_access_level):
--   full            pilot/comp (until access_ends_at, if set), trialing, active, past_due
--   owner_read_only suspended, incomplete (no subscription yet), pilot/comp after its end date,
--                   canceled during the 30-day export window (MSA 12.5)
--   none            canceled more than 30 days ago, or no subscription row
--
-- MSA v3.2 rules this follows:
--   5.3  a failed payment is retried and the owner is reminded; access stays on (past_due = full)
--   12.2 suspension only once Fees stay unpaid 14 days after a reminder. The daily job
--        /api/cron/subscription-enforcement sets status = suspended and emails the owner.
--        Suspension keeps read-only access for the owner so they can export.
--   5.8  dispute_hold = true stops that job from suspending the studio.
--   3.5  Pilot Access: status = pilot with the Order Form end date in access_ends_at.
--
-- Enforcement: RESTRICTIVE policies on every studio-scoped table, so they AND with the existing
-- 0003/0004 policies without rewriting them. service_role bypasses RLS, so server code that uses
-- the service key must call requireStudioRole (which now checks access too).

-- ---------------------------------------------------------------------------
-- a. Tables
-- ---------------------------------------------------------------------------
create table public.studio_subscription (
  studio_id uuid primary key references public.studio(id) on delete cascade,
  plan text not null default 'base' check (plan in ('base', 'pro')),
  status text not null default 'incomplete' check (status in (
    'incomplete', 'pilot', 'comp', 'trialing', 'active', 'past_due', 'suspended', 'canceled'
  )),
  -- pilot/comp: last day of free access (null = open-ended). canceled: when access ended.
  access_ends_at timestamptz,
  past_due_since timestamptz,
  -- First failed-payment reminder sent to the owner; the 14 days in MSA 12.2 run from here.
  reminder_sent_at timestamptz,
  suspended_at timestamptz,
  dispute_hold boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_stripe_event_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studio_subscription enable row level security;
revoke all on table public.studio_subscription from anon, public;
revoke insert, update, delete on table public.studio_subscription from authenticated;
grant select on table public.studio_subscription to authenticated;

-- Stripe webhook idempotency. Service role only.
create table public.billing_webhook_event (
  id text primary key,
  type text not null,
  studio_id uuid null references public.studio(id) on delete set null,
  received_at timestamptz not null default now()
);

alter table public.billing_webhook_event enable row level security;
revoke all on table public.billing_webhook_event from anon, authenticated, public;

create index studio_subscription_status_idx on public.studio_subscription (status);

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists studio_subscription_touch on public.studio_subscription;
create trigger studio_subscription_touch
  before update on public.studio_subscription
  for each row execute function app_private.touch_updated_at();

-- Existing studios keep working: complimentary Pro until the platform admin sets a real plan.
insert into public.studio_subscription (studio_id, plan, status, note)
select s.id, 'pro', 'comp', 'Existing studio before 0006; set the real plan in the admin console'
from public.studio s
on conflict (studio_id) do nothing;

-- New studios start with no subscription (owner read-only) until they pay or get a pilot.
create or replace function app_private.create_studio_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.studio_subscription (studio_id) values (new.id)
  on conflict (studio_id) do nothing;
  return new;
end;
$$;

drop trigger if exists studio_create_subscription on public.studio;
create trigger studio_create_subscription
  after insert on public.studio
  for each row execute function app_private.create_studio_subscription();

-- ---------------------------------------------------------------------------
-- b. Access helpers (owned by tenancy_helper, like 0003)
-- ---------------------------------------------------------------------------
grant select (studio_id, plan, status, access_ends_at) on table public.studio_subscription to tenancy_helper;

drop policy if exists tenancy_helper_studio_subscription_select on public.studio_subscription;
create policy tenancy_helper_studio_subscription_select on public.studio_subscription
  for select to tenancy_helper using (true);

create or replace function app_private.studio_access_level(target_studio uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when s.status in ('trialing', 'active', 'past_due') then 'full'
      when s.status in ('pilot', 'comp')
        and (s.access_ends_at is null or s.access_ends_at > now()) then 'full'
      when s.status = 'canceled'
        and s.access_ends_at is not null
        and s.access_ends_at + interval '30 days' <= now() then 'none'
      else 'owner_read_only'
    end
    from public.studio_subscription s
    where s.studio_id = target_studio
  ), 'none');
$$;

alter function app_private.studio_access_level(uuid) owner to tenancy_helper;

create or replace function app_private.studio_can_read(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case app_private.studio_access_level(target_studio)
    when 'full' then true
    when 'owner_read_only' then app_private.has_studio_role(target_studio, array['owner'])
    else false
  end;
$$;

alter function app_private.studio_can_read(uuid) owner to tenancy_helper;

create or replace function app_private.studio_can_write(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.studio_access_level(target_studio) = 'full';
$$;

alter function app_private.studio_can_write(uuid) owner to tenancy_helper;

revoke all on function app_private.studio_access_level(uuid) from public, anon;
revoke all on function app_private.studio_can_read(uuid) from public, anon;
revoke all on function app_private.studio_can_write(uuid) from public, anon;
grant execute on function app_private.studio_access_level(uuid) to authenticated;
grant execute on function app_private.studio_can_read(uuid) to authenticated;
grant execute on function app_private.studio_can_write(uuid) to authenticated;

-- Owners and admins can see their own studio's subscription row (billing page). No writes via API.
drop policy if exists studio_subscription_owner_admin_select on public.studio_subscription;
create policy studio_subscription_owner_admin_select on public.studio_subscription
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- c. Restrictive access gates on every studio-scoped table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  col text;
  gated_writes boolean;
begin
  foreach t in array array[
    'studio', 'studio_member', 'family', 'guardian', 'student', 'invitation',
    'invitation_student', 'intake_response', 'terms_document', 'terms_version',
    'terms_acceptance', 'consent_record', 'email_log', 'auth_audit', 'oauth_connection',
    'studio_billing_profile', 'invoice', 'invoice_line', 'payment', 'credit_note', 'invoice_event'
  ] loop
    col := case when t = 'studio' then 'id' else 'studio_id' end;
    -- auth_audit keeps recording sign-ins while a studio is paused.
    gated_writes := t <> 'auth_audit';

    execute format('drop policy if exists access_gate_select on public.%I', t);
    execute format('drop policy if exists access_gate_insert on public.%I', t);
    execute format('drop policy if exists access_gate_update on public.%I', t);
    execute format('drop policy if exists access_gate_delete on public.%I', t);

    execute format(
      'create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(%I))',
      t, col);
    if gated_writes then
      execute format(
        'create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(%I))',
        t, col);
      execute format(
        'create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(%I)) with check (app_private.studio_can_write(%I))',
        t, col, col);
      execute format(
        'create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(%I))',
        t, col);
    end if;
  end loop;
end $$;

-- Storage: only the studio buckets; other buckets are untouched. CASE keeps the uuid cast
-- away from object names in other buckets.
drop policy if exists access_gate_storage_select on storage.objects;
drop policy if exists access_gate_storage_insert on storage.objects;
drop policy if exists access_gate_storage_update on storage.objects;
drop policy if exists access_gate_storage_delete on storage.objects;

create policy access_gate_storage_select on storage.objects
  as restrictive for select to authenticated
  using (
    case when bucket_id in ('studio-media', 'studio-docs', 'invoices')
      then app_private.studio_can_read(app_private.storage_path_studio_id(name))
      else true end
  );
create policy access_gate_storage_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    case when bucket_id in ('studio-media', 'studio-docs', 'invoices')
      then app_private.studio_can_write(app_private.storage_path_studio_id(name))
      else true end
  );
create policy access_gate_storage_update on storage.objects
  as restrictive for update to authenticated
  using (
    case when bucket_id in ('studio-media', 'studio-docs', 'invoices')
      then app_private.studio_can_write(app_private.storage_path_studio_id(name))
      else true end
  )
  with check (
    case when bucket_id in ('studio-media', 'studio-docs', 'invoices')
      then app_private.studio_can_write(app_private.storage_path_studio_id(name))
      else true end
  );
create policy access_gate_storage_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    case when bucket_id in ('studio-media', 'studio-docs', 'invoices')
      then app_private.studio_can_write(app_private.storage_path_studio_id(name))
      else true end
  );

-- ---------------------------------------------------------------------------
-- d. Base plan: at most 35 students per studio. Applies to new students only, so a downgrade
--    never deletes or hides anyone (no student status column yet: every student row counts).
-- ---------------------------------------------------------------------------
create or replace function app_private.enforce_plan_student_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_studio uuid;
  current_plan text;
  student_count int;
begin
  target_studio := new.studio_id;
  if target_studio is null then
    select f.studio_id into target_studio from public.family f where f.id = new.family_id;
  end if;

  -- Row lock serialises concurrent inserts for the same studio.
  select s.plan into current_plan
  from public.studio_subscription s
  where s.studio_id = target_studio
  for update;

  if coalesce(current_plan, 'base') = 'base' then
    select count(*) into student_count from public.student st where st.studio_id = target_studio;
    if student_count >= 35 then
      raise exception 'base_plan_student_limit: the Base plan allows up to 35 students'
        using errcode = 'P0001', hint = 'Upgrade to Pro for unlimited students.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists student_plan_cap on public.student;
create trigger student_plan_cap
  before insert on public.student
  for each row execute function app_private.enforce_plan_student_cap();

-- ---------------------------------------------------------------------------
-- e. Platform audit event for access changes made in the admin console
-- ---------------------------------------------------------------------------
alter table public.platform_audit drop constraint if exists platform_audit_event_check;
alter table public.platform_audit add constraint platform_audit_event_check check (event in (
  'bootstrap_admin',
  'sign_in',
  'sign_in_no_account',
  'mfa_enrolled',
  'mfa_reset',
  'studio_created',
  'owner_invited',
  'staff_added',
  'staff_removed',
  'studio_access_changed'
));
