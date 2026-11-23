-- pgTAP tests for 0027 term renewals. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c9000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c9000000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'd9000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c9000000-0000-4000-8000-000000000009', true);

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

select set_config('test.studio_x', app_private.create_studio_with_owner('Renew X', 'Australia/Sydney', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Renew Y', 'Australia/Sydney', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.family_x', (select id::text from public.family where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.family_y', (select id::text from public.family where studio_id = current_setting('test.studio_y')::uuid), true);
select set_config('test.campaign_x', 'c9000000-0000-4000-8000-0000000000a1', true);
select set_config('test.response_x', 'c9000000-0000-4000-8000-0000000000b1', true);

-- Teacher X sends Term 1 2027 invitations.
select as_user(current_setting('test.teacher_x')::uuid);
select lives_ok($$ insert into public.renewal_campaign (id, studio_id, term_key, term_start, term_end, deadline)
  values (current_setting('test.campaign_x')::uuid, current_setting('test.studio_x')::uuid, '2027-T1', '2027-02-03', '2027-04-09', '2027-01-20') $$,
  'teacher X starts a renewal');
select throws_ok($$ insert into public.renewal_campaign (studio_id, term_key, term_start, term_end, deadline)
  values (current_setting('test.studio_x')::uuid, '2027-T1', '2027-02-03', '2027-04-09', '2027-01-20') $$,
  '23505', null, 'one renewal per term');
select throws_ok($$ insert into public.renewal_campaign (studio_id, term_key, term_start, term_end, deadline)
  values (current_setting('test.studio_x')::uuid, '2027-T2', '2027-04-29', '2027-07-02', '2027-08-01') $$,
  '23514', null, 'reply-by date must be before the term ends');
select throws_ok($$ insert into public.renewal_campaign (studio_id, term_key, term_start, term_end, deadline)
  values (current_setting('test.studio_x')::uuid, 'Term 2', '2027-04-29', '2027-07-02', '2027-04-01') $$,
  '23514', null, 'term key shape is checked');
select lives_ok($$ insert into public.renewal_response (id, studio_id, campaign_id, family_id)
  values (current_setting('test.response_x')::uuid, current_setting('test.studio_x')::uuid, current_setting('test.campaign_x')::uuid, current_setting('test.family_x')::uuid) $$,
  'teacher X invites a family');
select throws_ok($$ insert into public.renewal_response (studio_id, campaign_id, family_id)
  values (current_setting('test.studio_x')::uuid, current_setting('test.campaign_x')::uuid, current_setting('test.family_x')::uuid) $$,
  '23505', null, 'one invitation per family per term');
select throws_ok($$ insert into public.renewal_response (studio_id, campaign_id, family_id)
  values (current_setting('test.studio_x')::uuid, current_setting('test.campaign_x')::uuid, current_setting('test.family_y')::uuid) $$,
  '23514', null, 'cannot invite another studio''s family');
select throws_ok($$ update public.renewal_response set status = 'confirmed' where id = current_setting('test.response_x')::uuid $$,
  '23514', null, 'an answer needs a time and who gave it');
select lives_ok($$ update public.renewal_response set status = 'confirmed', responded_at = now(), responded_by = 'staff'
  where id = current_setting('test.response_x')::uuid $$, 'teacher records an answer');
select throws_ok($$ update public.renewal_response set family_id = current_setting('test.family_y')::uuid where id = current_setting('test.response_x')::uuid $$,
  '23514', null, 'an answer cannot move to another family');
select as_reset();

-- Other people.
select as_user(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.renewal_campaign), 0, 'owner Y sees no studio X renewals');
select is((select count(*)::int from public.renewal_response), 0, 'owner Y sees no studio X answers');
select as_reset();
select as_user(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.renewal_response), 0, 'guardian reads no answers directly');
update public.renewal_response set status = 'declined', responded_at = now(), responded_by = 'family' where true;
select as_reset();
select is((select status from public.renewal_response where id = current_setting('test.response_x')::uuid), 'confirmed', 'guardian cannot change answers directly');
select as_user('00000000-0000-4000-8000-000000000000'::uuid);
select is((select count(*)::int from public.renewal_campaign), 0, 'stranger sees nothing');
select as_reset();

-- Paused studio: readable by its owner, nobody writes.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select as_user(current_setting('test.owner_x')::uuid);
select is((select count(*)::int from public.renewal_campaign), 1, 'paused owner can still read renewals');
select throws_ok($$ insert into public.renewal_campaign (studio_id, term_key, term_start, term_end, deadline)
  values (current_setting('test.studio_x')::uuid, '2027-T2', '2027-04-29', '2027-07-02', '2027-04-01') $$,
  '42501', null, 'paused studio cannot start renewals');
select as_reset();

-- Deleting the family removes its answers.
delete from public.family where id = current_setting('test.family_x')::uuid;
select is((select count(*)::int from public.renewal_response), 0, 'answers go with the family');

select finish();
rollback;
