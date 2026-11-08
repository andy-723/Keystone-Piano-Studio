-- Built-in family invoicing (ADR-045). Mock mode stays default; this migration
-- mirrors the TypeScript contract so a later switch is mechanical.
-- Named 0004 because 0003_tenant_hardening already shipped on main; the product
-- prompt called this 0002_native_invoicing.sql when that was the next free number.
-- Uses app_private helpers from 0003.

-- ---------------------------------------------------------------------------
-- studio_billing_profile
-- ---------------------------------------------------------------------------
create table public.studio_billing_profile (
  studio_id uuid primary key references public.studio(id) on delete cascade,
  invoice_prefix text not null default 'INV-',
  next_invoice_number int not null default 1 check (next_invoice_number >= 1),
  credit_note_prefix text not null default 'CN-',
  next_credit_note_number int not null default 1 check (next_credit_note_number >= 1),
  numbering_locked_at timestamptz,
  pay_to_account_name text,
  pay_to_bsb text,
  pay_to_account_number text,
  pay_to_pay_id text,
  pay_to_pay_id_type text check (pay_to_pay_id_type is null or pay_to_pay_id_type in ('email', 'mobile', 'abn')),
  pay_to_cash_note text,
  attach_pdf boolean not null default true,
  pre_due_reminder_days int,
  receipt_emails boolean not null default true,
  auto_send_term_invoices boolean not null default false,
  tailored_pre_due_days int,
  tailored_pre_due_note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- invoice
-- ---------------------------------------------------------------------------
create table public.invoice (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  family_id uuid not null references public.family(id) on delete restrict,
  number text,
  status text not null check (status in ('draft', 'sent', 'partially_paid', 'paid', 'void')),
  kind text not null default 'standard' check (kind in ('standard', 'late_fee')),
  related_invoice_id uuid references public.invoice(id) on delete restrict,
  bill_to_guardian_id uuid references public.guardian(id) on delete set null,
  cc_guardian_ids uuid[] not null default '{}',
  billing_period_start date,
  billing_period_end date,
  terms_version_id uuid,
  snapshot jsonb,
  pdf_path text,
  pdf_sha256 text,
  collection text not null default 'manual' check (collection in ('manual', 'stripe')),
  queried_at timestamptz,
  query_resolved_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  sent_at timestamptz,
  issue_date date not null,
  due_date date not null,
  subtotal_cents int not null,
  tax_cents int not null,
  total_cents int not null,
  is_tax_invoice boolean not null default false,
  gst_registered boolean,
  title text check (title is null or title in ('Tax invoice', 'Invoice')),
  term_key text,
  reviewed_at timestamptz,
  xero_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoice_late_fee_related check (
    (kind = 'late_fee' and related_invoice_id is not null)
    or (kind = 'standard' and related_invoice_id is null)
  )
);

create unique index invoice_studio_number_uidx
  on public.invoice (studio_id, number)
  where number is not null;

create unique index invoice_one_late_fee_uidx
  on public.invoice (related_invoice_id)
  where kind = 'late_fee';

-- ---------------------------------------------------------------------------
-- invoice_line
-- ---------------------------------------------------------------------------
create table public.invoice_line (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  description text not null,
  qty int not null,
  unit_cents int not null,
  tax_cents int not null default 0,
  line_total_cents int not null,
  student_id uuid references public.student(id) on delete set null,
  lesson_type_id uuid,
  tax_code text not null default 'taxable' check (tax_code in ('taxable', 'gst_free')),
  credit_note_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- payment
-- ---------------------------------------------------------------------------
create table public.payment (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  invoice_id uuid not null references public.invoice(id) on delete restrict,
  family_id uuid not null references public.family(id) on delete restrict,
  amount_cents int not null,
  method text not null check (method in (
    'bank_transfer', 'payid', 'cash', 'card_in_person',
    'stripe_card', 'stripe_becs', 'stripe_payto', 'credit'
  )),
  received_on date not null,
  reference text,
  recorded_by uuid,
  reverses_payment_id uuid references public.payment(id) on delete restrict,
  stripe_payment_intent_id text,
  xero_synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- credit_note
-- ---------------------------------------------------------------------------
create table public.credit_note (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  number text not null,
  family_id uuid not null references public.family(id) on delete restrict,
  invoice_id uuid references public.invoice(id) on delete restrict,
  reason text not null,
  amount_cents int not null,
  tax_cents int not null default 0,
  status text not null check (status in ('open', 'applied', 'refunded')),
  issued_on date not null,
  pdf_path text,
  pdf_sha256 text,
  created_at timestamptz not null default now(),
  unique (studio_id, number)
);

alter table public.invoice_line
  add constraint invoice_line_credit_note_fk
  foreign key (credit_note_id) references public.credit_note(id) on delete set null;

-- ---------------------------------------------------------------------------
-- invoice_event
-- ---------------------------------------------------------------------------
create table public.invoice_event (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  kind text not null,
  actor text not null,
  at timestamptz not null default now(),
  data jsonb,
  created_at timestamptz not null default now()
);

create unique index invoice_event_once_reminder_pre_due
  on public.invoice_event (invoice_id, kind) where kind = 'reminder_pre_due';
create unique index invoice_event_once_reminder_overdue
  on public.invoice_event (invoice_id, kind) where kind = 'reminder_overdue';
create unique index invoice_event_once_late_fee_proposed
  on public.invoice_event (invoice_id, kind) where kind = 'late_fee_proposed';
create unique index invoice_event_once_late_fee_applied
  on public.invoice_event (invoice_id, kind) where kind = 'late_fee_applied';
create unique index invoice_event_once_late_fee_waived
  on public.invoice_event (invoice_id, kind) where kind = 'late_fee_waived';
create unique index invoice_event_once_pause_notice_proposed
  on public.invoice_event (invoice_id, kind) where kind = 'pause_notice_proposed';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index invoice_studio_id_idx on public.invoice (studio_id);
create index invoice_family_id_idx on public.invoice (family_id);
create index invoice_line_studio_id_idx on public.invoice_line (studio_id);
create index payment_studio_id_idx on public.payment (studio_id);
create index credit_note_studio_id_idx on public.credit_note (studio_id);
create index invoice_event_studio_id_idx on public.invoice_event (studio_id);

-- ---------------------------------------------------------------------------
-- send_invoice: allocate number + lock + flip status in one transaction
-- ---------------------------------------------------------------------------
create or replace function public.send_invoice(p_invoice_id uuid)
returns public.invoice
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoice;
  profile public.studio_billing_profile;
  allocated text;
begin
  select * into inv from public.invoice where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if inv.status <> 'draft' then
    return inv; -- idempotent
  end if;

  select * into profile
  from public.studio_billing_profile
  where studio_id = inv.studio_id
  for update;
  if not found then
    raise exception 'Billing profile missing';
  end if;

  allocated := profile.invoice_prefix || lpad(profile.next_invoice_number::text, 6, '0');

  update public.studio_billing_profile
  set next_invoice_number = next_invoice_number + 1,
      numbering_locked_at = coalesce(numbering_locked_at, now())
  where studio_id = inv.studio_id;

  update public.invoice
  set number = allocated,
      status = 'sent',
      sent_at = now()
  where id = p_invoice_id
  returning * into inv;

  insert into public.invoice_event (studio_id, invoice_id, kind, actor)
  values (inv.studio_id, inv.id, 'sent', coalesce(auth.uid()::text, 'system'));

  return inv;
end;
$$;

revoke all on function public.send_invoice(uuid) from public, anon, authenticated;
grant execute on function public.send_invoice(uuid) to service_role;

create or replace function public.issue_credit_note_number(p_studio_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.studio_billing_profile;
  allocated text;
begin
  select * into profile from public.studio_billing_profile where studio_id = p_studio_id for update;
  if not found then raise exception 'Billing profile missing'; end if;
  allocated := profile.credit_note_prefix || lpad(profile.next_credit_note_number::text, 6, '0');
  update public.studio_billing_profile
  set next_credit_note_number = next_credit_note_number + 1
  where studio_id = p_studio_id;
  return allocated;
end;
$$;

revoke all on function public.issue_credit_note_number(uuid) from public, anon, authenticated;
grant execute on function public.issue_credit_note_number(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Freeze / insert-only triggers
-- ---------------------------------------------------------------------------
create or replace function app_private.guard_invoice_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Only draft invoices can be deleted';
  end if;
  -- Allowed mutable columns after send
  if new.family_id is distinct from old.family_id
     or new.number is distinct from old.number
     or new.kind is distinct from old.kind
     or new.related_invoice_id is distinct from old.related_invoice_id
     or new.snapshot is distinct from old.snapshot
     or new.subtotal_cents is distinct from old.subtotal_cents
     or new.tax_cents is distinct from old.tax_cents
     or new.total_cents is distinct from old.total_cents
     or new.issue_date is distinct from old.issue_date
     or new.is_tax_invoice is distinct from old.is_tax_invoice
     or new.title is distinct from old.title
     or new.gst_registered is distinct from old.gst_registered
     or new.terms_version_id is distinct from old.terms_version_id
  then
    raise exception 'Frozen invoice columns cannot change';
  end if;
  return new;
end;
$$;

create trigger invoice_frozen_guard
  before update or delete on public.invoice
  for each row execute function app_private.guard_invoice_frozen();

create or replace function app_private.reject_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'This table is insert-only';
end;
$$;

create trigger payment_insert_only
  before update or delete on public.payment
  for each row execute function app_private.reject_mutation();

create trigger invoice_event_insert_only
  before update or delete on public.invoice_event
  for each row execute function app_private.reject_mutation();

-- ---------------------------------------------------------------------------
-- View: balances + overdue (studio timezone via due_date vs current_date)
-- ---------------------------------------------------------------------------
create or replace view public.invoice_with_balance
with (security_invoker = true)
as
select
  i.*,
  coalesce((
    select sum(p.amount_cents)::int from public.payment p where p.invoice_id = i.id
  ), 0) as paid_cents,
  i.total_cents - coalesce((
    select sum(p.amount_cents)::int from public.payment p where p.invoice_id = i.id
  ), 0) as balance_cents,
  (
    i.status not in ('draft', 'paid', 'void')
    and i.due_date < current_date
    and (i.total_cents - coalesce((select sum(p.amount_cents)::int from public.payment p where p.invoice_id = i.id), 0)) > 0
  ) as is_overdue,
  greatest(
    0,
    (current_date - i.due_date)
  ) as days_overdue
from public.invoice i;

grant select on public.invoice_with_balance to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.studio_billing_profile enable row level security;
alter table public.invoice enable row level security;
alter table public.invoice_line enable row level security;
alter table public.payment enable row level security;
alter table public.credit_note enable row level security;
alter table public.invoice_event enable row level security;

-- Staff
create policy billing_profile_staff_select on public.studio_billing_profile
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy billing_profile_staff_update on public.studio_billing_profile
  for update to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin']));
-- Pay-to columns: app enforces owner + aal2; owners/admins may update profile rows above.

create policy invoice_staff_all on public.invoice
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy invoice_line_staff_all on public.invoice_line
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy payment_staff_all on public.payment
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy credit_note_staff_all on public.credit_note
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy invoice_event_staff_all on public.invoice_event
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

-- Guardians: own family, no drafts
create policy invoice_guardian_select on public.invoice
  for select to authenticated
  using (
    status <> 'draft'
    and family_id in (select app_private.guardian_family_ids())
  );
create policy invoice_line_guardian_select on public.invoice_line
  for select to authenticated
  using (
    exists (
      select 1 from public.invoice i
      where i.id = invoice_id
        and i.status <> 'draft'
        and i.family_id in (select app_private.guardian_family_ids())
    )
  );
create policy payment_guardian_select on public.payment
  for select to authenticated
  using (family_id in (select app_private.guardian_family_ids()));
create policy credit_note_guardian_select on public.credit_note
  for select to authenticated
  using (family_id in (select app_private.guardian_family_ids()));

-- ---------------------------------------------------------------------------
-- Private Storage bucket for invoice PDFs
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

drop policy if exists invoices_pdf_staff on storage.objects;
drop policy if exists invoices_pdf_guardian on storage.objects;

create policy invoices_pdf_staff on storage.objects
  for all to authenticated
  using (
    bucket_id = 'invoices'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  )
  with check (
    bucket_id = 'invoices'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  );

create policy invoices_pdf_guardian on storage.objects
  for select to authenticated
  using (
    bucket_id = 'invoices'
    and exists (
      select 1 from public.invoice i
      where i.studio_id = app_private.storage_path_studio_id(name)
        and i.id::text = split_part(name, '/', 2)
        and i.status <> 'draft'
        and i.family_id in (select app_private.guardian_family_ids())
    )
  );
