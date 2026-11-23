-- pgTAP tests for 0024 enrolment wizard progress. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'e7000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'e7000000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'f7000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'e7000000-0000-4000-8000-000000000009', true);

create or replace function ep_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function ep_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Enrol X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Enrol Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'epx@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);

-- Teacher X saves and updates a student's wizard progress.
select ep_as(current_setting('test.teacher_x')::uuid);
select lives_ok($$ insert into public.enrolment_progress (studio_id, student_id, step, status, answers)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, 2, 'intake_done', '{"welcomeChecks":["a"]}') $$,
  'teacher X saves wizard progress');
select is((select updated_by from public.enrolment_progress), current_setting('test.teacher_x')::uuid, 'database stamps who saved');
select lives_ok($$ update public.enrolment_progress set step = 3, status = 'welcome_done'
  where student_id = current_setting('test.student_x')::uuid $$, 'teacher X moves to step 3');
select throws_ok($$ update public.enrolment_progress set step = 5 where student_id = current_setting('test.student_x')::uuid $$,
  '23514', null, 'step must be 1 to 4');
select throws_ok($$ update public.enrolment_progress set student_id = current_setting('test.student_y')::uuid
  where student_id = current_setting('test.student_x')::uuid $$,
  '23514', null, 'progress cannot move to another student');
select throws_ok($$ insert into public.enrolment_progress (studio_id, student_id)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_y')::uuid) $$,
  '23514', null, 'cannot save progress for another studio''s student');
select throws_ok($$ delete from public.enrolment_progress $$, '42501', null, 'staff cannot delete progress (kept as the welcome record)');
select ep_reset();

-- Families and other studios see nothing.
select ep_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.enrolment_progress), 0, 'guardian reads no wizard progress');
select ep_reset();
select ep_as(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.enrolment_progress), 0, 'owner Y sees no studio X progress');
select throws_ok($$ insert into public.enrolment_progress (studio_id, student_id)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid) $$,
  '42501', null, 'owner Y cannot write into studio X');
select ep_reset();

-- Paused studio: owner reads, nobody writes.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select ep_as(current_setting('test.owner_x')::uuid);
select is((select step::int from public.enrolment_progress), 3, 'paused owner can still read progress');
select lives_ok($$ update public.enrolment_progress set step = 4 $$, 'paused update runs');
select is((select step::int from public.enrolment_progress), 3, 'paused studio cannot save progress (no row changed)');
select ep_reset();

-- Deleting a student removes their progress.
delete from public.student where id = current_setting('test.student_x')::uuid;
select is((select count(*)::int from public.enrolment_progress), 0, 'progress goes with the student');

select finish();
rollback;
