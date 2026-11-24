-- pgTAP tests for 0028 Tax Lite records and Stripe fees. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c8000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c8000000-0000-4000-8000-000000000002', true);
select set_config('test.admin_x', 'c8000000-0000-4000-8000-000000000003', true);
select set_config('test.owner_y', 'd8000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c8000000-0000-4000-8000-000000000009', true);

create or replace function as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function as_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Tax X', 'Australia/Sydney', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Tax Y', 'Australia/Sydney', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values
  (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher'),
  (current_setting('test.studio_x')::uuid, current_setting('test.admin_x')::uuid, 'admin');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.family_x', (select id::text from public.family where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);

-- A paid online payment in studio X (as the server would record it).
select set_config('test.invoice_x', 'c8000000-0000-4000-8000-0000000000f1', true);
select set_config('test.payment_x', 'c8000000-0000-4000-8000-0000000000f2', true);
insert into public.invoice (id, studio_id, family_id, status, issue_date, due_date, subtotal_cents, tax_cents, total_cents)
values (current_setting('test.invoice_x')::uuid, current_setting('test.studio_x')::uuid, current_setting('test.family_x')::uuid,
  'sent', '2026-11-01', '2026-11-15', 11000, 0, 11000);
insert into public.payment (id, studio_id, invoice_id, family_id, amount_cents, method, received_on, stripe_payment_intent_id)
values (current_setting('test.payment_x')::uuid, current_setting('test.studio_x')::uuid, current_setting('test.invoice_x')::uuid,
  current_setting('test.family_x')::uuid, 11000, 'stripe_card', '2026-11-02', 'pi_test_1');

-- Owner X keeps records.
select as_user(current_setting('test.owner_x')::uuid);
select lives_ok($$ insert into public.tax_expense (studio_id, expense_date, vendor, category, amount_cents, includes_gst)
  values (current_setting('test.studio_x')::uuid, '2026-11-10', 'Piano tuner', 'Repairs & consumables', 18000, true) $$,
  'owner logs a cost');
select lives_ok($$ insert into public.tax_expense (studio_id, expense_date, vendor, category, amount_cents, pass_through_student_id, attached_invoice_id)
  values (current_setting('test.studio_x')::uuid, '2026-11-11', 'AMEB', 'Teaching materials & pass-throughs', 9500,
    current_setting('test.student_x')::uuid, current_setting('test.invoice_x')::uuid) $$,
  'owner logs an on-charged cost for their student');
select throws_ok($$ insert into public.tax_expense (studio_id, expense_date, vendor, category, amount_cents, pass_through_student_id)
  values (current_setting('test.studio_x')::uuid, '2026-11-11', 'AMEB', 'Teaching materials & pass-throughs', 9500,
    current_setting('test.student_y')::uuid) $$,
  '23514', null, 'cannot on-charge another studio''s student');
select throws_ok($$ insert into public.tax_expense (studio_id, expense_date, vendor, category, amount_cents)
  values (current_setting('test.studio_x')::uuid, '2026-11-11', 'Shop', 'Holidays', 100) $$,
  '23514', null, 'category must be one of the Tax Lite list');
select throws_ok($$ insert into public.tax_expense (studio_id, expense_date, vendor, category, amount_cents)
  values (current_setting('test.studio_x')::uuid, '2026-11-11', 'Shop', 'Other deductible', 0) $$,
  '23514', null, 'amount must be positive');
select lives_ok($$ insert into public.tax_km_entry (studio_id, entry_date, kilometres, purpose)
  values (current_setting('test.studio_x')::uuid, '2026-11-12', 18.5, 'Exam venue') $$, 'owner logs kilometres');
select lives_ok($$ insert into public.tax_admin_session (studio_id, session_date, hours, note)
  values (current_setting('test.studio_x')::uuid, '2026-11-12', 1.5, 'Invoices') $$, 'owner logs admin time');
select throws_ok($$ insert into public.tax_admin_session (studio_id, session_date, hours, note)
  values (current_setting('test.studio_x')::uuid, '2026-11-12', 25, 'Too long') $$,
  '23514', null, 'admin time is at most 24 hours a day');
select lives_ok($$ insert into public.tax_home_lesson (studio_id, occurrence_key, lesson_date, minutes, from_home)
  values (current_setting('test.studio_x')::uuid, 'series_2026-11-02', '2026-11-02', 30, true)
  on conflict (studio_id, occurrence_key) do update set from_home = excluded.from_home $$, 'owner confirms a home lesson');
select lives_ok($$ insert into public.tax_home_lesson (studio_id, occurrence_key, lesson_date, minutes, from_home)
  values (current_setting('test.studio_x')::uuid, 'series_2026-11-02', '2026-11-02', 30, false)
  on conflict (studio_id, occurrence_key) do update set from_home = excluded.from_home $$, 'owner changes their answer');
select is((select from_home from public.tax_home_lesson where occurrence_key = 'series_2026-11-02'), false, 'one answer per lesson');
select throws_ok($$ insert into public.payment_stripe_fee (payment_id, studio_id, gross_cents, fee_cents, net_cents)
  values (current_setting('test.payment_x')::uuid, current_setting('test.studio_x')::uuid, 11000, 0, 11000) $$,
  '42501', null, 'staff cannot write Stripe fees');
select as_reset();

-- The server saves Stripe's fee.
insert into public.payment_stripe_fee (payment_id, studio_id, gross_cents, fee_cents, net_cents, balance_transaction_id)
values (current_setting('test.payment_x')::uuid, current_setting('test.studio_x')::uuid, 11000, 212, 10788, 'txn_1');
select throws_ok($$ insert into public.payment_stripe_fee (payment_id, studio_id, gross_cents, fee_cents, net_cents)
  values (current_setting('test.payment_x')::uuid, current_setting('test.studio_y')::uuid, 11000, 212, 10788) $$,
  null, null, 'a fee cannot be filed under another studio');

-- Admin X reads everything; teacher X and others read nothing.
select as_user(current_setting('test.admin_x')::uuid);
select is((select count(*)::int from public.tax_expense), 2, 'admin X sees the costs');
select is((select fee_cents from public.payment_stripe_fee), 212, 'admin X sees the Stripe fee');
select as_reset();
select as_user(current_setting('test.teacher_x')::uuid);
select is((select count(*)::int from public.tax_expense), 0, 'teacher sees no costs');
select is((select count(*)::int from public.payment_stripe_fee), 0, 'teacher sees no fees');
select throws_ok($$ insert into public.tax_km_entry (studio_id, entry_date, kilometres, purpose)
  values (current_setting('test.studio_x')::uuid, '2026-11-12', 5, 'Teacher trip') $$,
  '42501', null, 'teacher cannot log for the studio');
select as_reset();
select as_user(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.tax_expense), 0, 'owner Y sees no studio X costs');
select is((select count(*)::int from public.tax_home_lesson), 0, 'owner Y sees no studio X lessons');
select is((select count(*)::int from public.payment_stripe_fee), 0, 'owner Y sees no studio X fees');
select throws_ok($$ insert into public.tax_expense (studio_id, expense_date, vendor, category, amount_cents)
  values (current_setting('test.studio_x')::uuid, '2026-11-11', 'Shop', 'Other deductible', 100) $$,
  '42501', null, 'owner Y cannot write into studio X');
select as_reset();
select as_user(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.tax_expense), 0, 'guardian sees no costs');
select is((select count(*)::int from public.payment_stripe_fee), 0, 'guardian sees no fees');
select as_reset();

-- Paused studio: owner can still read, nobody writes.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select as_user(current_setting('test.owner_x')::uuid);
select is((select count(*)::int from public.tax_km_entry), 1, 'paused owner can still read records');
select throws_ok($$ insert into public.tax_km_entry (studio_id, entry_date, kilometres, purpose)
  values (current_setting('test.studio_x')::uuid, '2026-11-13', 5, 'Trip') $$,
  '42501', null, 'paused studio cannot add records');
select as_reset();

select finish();
rollback;
