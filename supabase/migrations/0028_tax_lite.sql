-- 0028 Tax Lite and Pro CFO on real data (24 Nov 2026).
-- Tax Lite records a studio keeps for its own tax time. Keystone is not a registered tax or BAS
-- agent: these are the studio's own records, not a ledger.
--   tax_expense        costs the owner logs; an on-charged cost names the student and the draft
--                      invoice the reimbursement line went on.
--   tax_km_entry       optional light kilometre log (cents per km, sole traders only).
--   tax_admin_session  admin time worked from home, logged as it happens (tax review T-05).
--   tax_home_lesson    the teacher's yes/no for each past calendar lesson: taught from home or
--                      not. Only "yes" rows count toward home-studio hours (T-05).
--   payment_stripe_fee the actual fee Stripe reported for an online payment (T-06). Written only
--                      by the server (webhook / fee refresh); staff read it.
-- Owners and admins only (the Snapshot page is theirs); teachers and families have no access.
-- Expand-only: five new tables; the app shows empty Tax Lite lists if they are missing.

create table public.tax_expense (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  expense_date date not null,
  vendor text not null check (char_length(vendor) between 1 and 120),
  category text not null check (category in (
    'Teaching materials & pass-throughs',
    'Instruments & gear',
    'Repairs & consumables',
    'Software & subscriptions',
    'Commercial rent & venue hire',
    'Other deductible'
  )),
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  includes_gst boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 500),
  pass_through_student_id uuid references public.student(id) on delete set null,
  pass_through_family_id uuid references public.family(id) on delete set null,
  attached_invoice_id uuid references public.invoice(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index tax_expense_studio_date_idx on public.tax_expense (studio_id, expense_date desc);

create table public.tax_km_entry (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  entry_date date not null,
  kilometres numeric(7, 1) not null check (kilometres > 0 and kilometres <= 5000),
  purpose text not null check (char_length(purpose) between 1 and 200),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index tax_km_entry_studio_date_idx on public.tax_km_entry (studio_id, entry_date desc);

create table public.tax_admin_session (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  session_date date not null,
  hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
  note text not null check (char_length(note) between 1 and 300),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index tax_admin_session_studio_date_idx on public.tax_admin_session (studio_id, session_date desc);

create table public.tax_home_lesson (
  studio_id uuid not null references public.studio(id) on delete cascade,
  -- The calendar occurrence key ("<series id>_<original date>"), same as lesson_attendance.
  occurrence_key text not null check (char_length(occurrence_key) between 1 and 120),
  lesson_date date not null,
  minutes int not null check (minutes between 1 and 240),
  from_home boolean not null,
  confirmed_by uuid,
  confirmed_at timestamptz not null default now(),
  primary key (studio_id, occurrence_key)
);
create index tax_home_lesson_date_idx on public.tax_home_lesson (studio_id, lesson_date);

create table public.payment_stripe_fee (
  payment_id uuid primary key references public.payment(id) on delete cascade,
  studio_id uuid not null references public.studio(id) on delete cascade,
  gross_cents int not null check (gross_cents >= 0),
  fee_cents int not null check (fee_cents >= 0),
  net_cents int not null,
  balance_transaction_id text check (char_length(balance_transaction_id) <= 120),
  fetched_at timestamptz not null default now()
);
create index payment_stripe_fee_studio_idx on public.payment_stripe_fee (studio_id);

-- Linked rows must belong to the same studio.
create or replace function app_private.check_tax_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.studio_id is distinct from old.studio_id then
    raise exception 'An expense cannot move to another studio' using errcode = '23514';
  end if;
  if new.pass_through_student_id is not null and not exists (
    select 1 from public.student s where s.id = new.pass_through_student_id and s.studio_id = new.studio_id
  ) then
    raise exception 'Student is not in this studio' using errcode = '23514';
  end if;
  if new.pass_through_family_id is not null and not exists (
    select 1 from public.family f where f.id = new.pass_through_family_id and f.studio_id = new.studio_id
  ) then
    raise exception 'Family is not in this studio' using errcode = '23514';
  end if;
  if new.attached_invoice_id is not null and not exists (
    select 1 from public.invoice i where i.id = new.attached_invoice_id and i.studio_id = new.studio_id
  ) then
    raise exception 'Invoice is not in this studio' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger tax_expense_guard before insert or update on public.tax_expense
  for each row execute function app_private.check_tax_expense();

create or replace function app_private.check_payment_stripe_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.payment p where p.id = new.payment_id and p.studio_id = new.studio_id
  ) then
    raise exception 'Payment is not in this studio' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger payment_stripe_fee_guard before insert or update on public.payment_stripe_fee
  for each row execute function app_private.check_payment_stripe_fee();

alter table public.tax_expense enable row level security;
alter table public.tax_km_entry enable row level security;
alter table public.tax_admin_session enable row level security;
alter table public.tax_home_lesson enable row level security;
alter table public.payment_stripe_fee enable row level security;

-- Supabase default privileges grant everything to authenticated: take it back, then allow owners/admins.
revoke all on table public.tax_expense, public.tax_km_entry, public.tax_admin_session,
  public.tax_home_lesson, public.payment_stripe_fee from anon, authenticated, public;
grant select, insert, update, delete on table public.tax_expense, public.tax_km_entry,
  public.tax_admin_session, public.tax_home_lesson to authenticated;
-- Fees come from Stripe through the server only.
grant select on table public.payment_stripe_fee to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['tax_expense', 'tax_km_entry', 'tax_admin_session', 'tax_home_lesson'] loop
    execute format('create policy %I on public.%I for all to authenticated using (app_private.has_studio_role(studio_id, array[''owner'',''admin''])) with check (app_private.has_studio_role(studio_id, array[''owner'',''admin'']))', t || '_owner_admin_all', t);
  end loop;
end $$;

create policy payment_stripe_fee_owner_admin_select on public.payment_stripe_fee
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']));

do $$
declare
  t text;
begin
  foreach t in array array['tax_expense', 'tax_km_entry', 'tax_admin_session', 'tax_home_lesson', 'payment_stripe_fee'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
