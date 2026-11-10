-- pgTAP tests for 0016 live studio invoicing. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c6000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c6000000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'd6000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c6000000-0000-4000-8000-000000000009', true);

create or replace function bill_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function bill_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Bill X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Bill Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.family_x', (select id::text from public.family where studio_id = current_setting('test.studio_x')::uuid), true);

select is((select count(*)::int from public.studio_billing_profile where studio_id = current_setting('test.studio_x')::uuid), 1,
  'a new studio gets a billing profile');

-- Teacher X drafts and sends two invoices: numbers are gapless.
select bill_as(current_setting('test.teacher_x')::uuid);
select lives_ok($$ insert into public.invoice (id, studio_id, family_id, status, issue_date, due_date, subtotal_cents, tax_cents, total_cents)
  values ('c6100000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, current_setting('test.family_x')::uuid, 'draft', '2026-11-10', '2026-11-24', 10000, 0, 10000),
         ('c6100000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, current_setting('test.family_x')::uuid, 'draft', '2026-11-10', '2026-11-24', 5000, 0, 5000) $$,
  'teacher drafts invoices');
select is((select number from public.send_studio_invoice('c6100000-0000-4000-8000-000000000001')), 'INV-000001', 'first send gets INV-000001');
select is((select number from public.send_studio_invoice('c6100000-0000-4000-8000-000000000002')), 'INV-000002', 'second send gets INV-000002');
select is((select number from public.send_studio_invoice('c6100000-0000-4000-8000-000000000001')), 'INV-000001', 'sending again changes nothing');
select is((select status from public.invoice where id = 'c6100000-0000-4000-8000-000000000001'), 'sent', 'status is sent');
select is(public.issue_studio_credit_note_number(current_setting('test.studio_x')::uuid), 'CN-000001', 'credit note number');
select throws_ok($$ update public.invoice set total_cents = 1 where id = 'c6100000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'a sent invoice total cannot change');
select lives_ok($$ insert into public.payment (studio_id, invoice_id, family_id, amount_cents, method, received_on)
  values (current_setting('test.studio_x')::uuid, 'c6100000-0000-4000-8000-000000000001', current_setting('test.family_x')::uuid, 10000, 'bank_transfer', '2026-11-11') $$,
  'teacher records a payment');
select lives_ok($$ update public.invoice set status = 'paid' where id = 'c6100000-0000-4000-8000-000000000001' $$, 'status can move to paid');
select bill_reset();

-- Owner X cannot rewind numbering after it is locked.
select bill_as(current_setting('test.owner_x')::uuid);
select throws_ok($$ update public.studio_billing_profile set next_invoice_number = 1 where studio_id = current_setting('test.studio_x')::uuid $$,
  '42501', null, 'locked numbering cannot be edited');
select lives_ok($$ update public.studio_billing_profile set receipt_emails = false, pay_to_bsb = '062000' where studio_id = current_setting('test.studio_x')::uuid $$,
  'owner edits other billing settings');
select bill_reset();

-- Owner Y cannot send or number for studio X.
select bill_as(current_setting('test.owner_y')::uuid);
select throws_ok($$ select public.send_studio_invoice('c6100000-0000-4000-8000-000000000002') $$, '42501', null, 'owner Y cannot send studio X invoices');
select throws_ok($$ select public.issue_studio_credit_note_number(current_setting('test.studio_x')::uuid) $$, '42501', null, 'owner Y cannot take studio X numbers');
select is((select count(*)::int from public.invoice), 0, 'owner Y sees no studio X invoices');
select bill_reset();

-- Guardian X sees sent invoices for their family, and cannot send.
select bill_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.invoice), 2, 'guardian sees their sent invoices');
select throws_ok($$ select public.issue_studio_credit_note_number(current_setting('test.studio_x')::uuid) $$, '42501', null, 'guardian cannot take numbers');
select bill_reset();

-- Paused studio: no sends.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select bill_as(current_setting('test.owner_x')::uuid);
select throws_ok($$ select public.issue_studio_credit_note_number(current_setting('test.studio_x')::uuid) $$, '42501', null, 'paused studio cannot issue');
select bill_reset();

select finish();
rollback;
