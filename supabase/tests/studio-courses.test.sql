-- pgTAP tests for 0015 studio courses. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c5000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c5000000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'd5000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c5000000-0000-4000-8000-000000000009', true);

create or replace function course_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function course_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Course X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Course Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);

-- Owner X saves a course and a template.
select course_as(current_setting('test.owner_x')::uuid);
select lives_ok($$ insert into public.student_course (id, studio_id, student_id, data)
  values ('c5100000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '{"course":{}}') $$,
  'owner X saves a student course');
select throws_ok($$ insert into public.student_course (studio_id, student_id, data)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '{"course":{}}') $$,
  '23505', null, 'only one active course per student');
select throws_ok($$ insert into public.student_course (studio_id, student_id, data)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_y')::uuid, '{"course":{}}') $$,
  '23514', null, 'a course cannot point at another studio''s student');
select throws_ok($$ insert into public.student_course (studio_id, student_id, data)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '[]') $$,
  '23514', null, 'course data must be an object');
select lives_ok($$ insert into public.library_item (id, studio_id, kind, data)
  values ('c5200000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, 'course', '{"name":"My course"}') $$,
  'owner X saves a Library template');
select throws_ok($$ insert into public.library_item (studio_id, kind, data)
  values (current_setting('test.studio_x')::uuid, 'video', '{}') $$,
  '23514', null, 'Library kind is checked');
select course_reset();

-- Teacher X edits the course; archiving lets a new active one in.
select course_as(current_setting('test.teacher_x')::uuid);
select lives_ok($$ update public.student_course set data = '{"course":{"targetTerm":"2027-T3"}}' where id = 'c5100000-0000-4000-8000-000000000001' $$,
  'teacher X edits the course');
select is((select data->'course'->>'targetTerm' from public.student_course where id = 'c5100000-0000-4000-8000-000000000001'), '2027-T3', 'edit saved');
select lives_ok($$ update public.student_course set status = 'archived' where id = 'c5100000-0000-4000-8000-000000000001' $$, 'teacher archives the course');
select lives_ok($$ insert into public.student_course (studio_id, student_id, data)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '{"course":{}}') $$,
  'a new active course after archiving');
select throws_ok($$ update public.student_course set student_id = gen_random_uuid() where id = 'c5100000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a course cannot move to another student');
select course_reset();

-- Guardian X and owner Y see nothing.
select course_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.student_course), 0, 'guardian reads no courses yet');
select is((select count(*)::int from public.library_item), 0, 'guardian reads no Library items');
select course_reset();
select course_as(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.student_course), 0, 'owner Y sees no studio X courses');
select is((select count(*)::int from public.library_item), 0, 'owner Y sees no studio X Library');
select throws_ok($$ insert into public.library_item (studio_id, kind, data)
  values (current_setting('test.studio_x')::uuid, 'course', '{}') $$,
  '42501', null, 'owner Y cannot write into studio X');
select course_reset();

-- Deleting a student removes their courses.
delete from public.student where id = current_setting('test.student_x')::uuid;
select is((select count(*)::int from public.student_course where studio_id = current_setting('test.studio_x')::uuid), 0, 'courses go with the student');

-- Paused studio: owner reads, nobody writes.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select course_as(current_setting('test.owner_x')::uuid);
select is((select count(*)::int from public.library_item), 1, 'paused owner can still read the Library');
select throws_ok($$ insert into public.library_item (studio_id, kind, data)
  values (current_setting('test.studio_x')::uuid, 'course', '{}') $$,
  '42501', null, 'paused studio cannot add templates');
update public.library_item set data = '{"name":"x"}' where id = 'c5200000-0000-4000-8000-000000000001';
select is((select data->>'name' from public.library_item where id = 'c5200000-0000-4000-8000-000000000001'), 'My course', 'paused studio edits change nothing');
select course_reset();

select finish();
rollback;
