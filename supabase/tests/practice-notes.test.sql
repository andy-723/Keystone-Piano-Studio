-- pgTAP tests for 0023 practice logs and client notes. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c7000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c7000000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'd7000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c7000000-0000-4000-8000-000000000009', true);

create or replace function pn_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function pn_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Practice X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Practice Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);
select set_config('test.family_x', (select id::text from public.family where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.family_y', (select id::text from public.family where studio_id = current_setting('test.studio_y')::uuid), true);

-- Teacher X logs practice and writes notes.
select pn_as(current_setting('test.teacher_x')::uuid);
select lives_ok($$ insert into public.practice_log (studio_id, student_id, practice_date, minutes, logged_by)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-23', 30, 'teacher') $$,
  'teacher X logs practice');
select throws_ok($$ insert into public.practice_log (studio_id, student_id, practice_date, minutes, logged_by)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-23', 0, 'teacher') $$,
  '23514', null, 'minutes must be 1 to 600');
select throws_ok($$ insert into public.practice_log (studio_id, student_id, practice_date, minutes, logged_by)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_y')::uuid, '2026-11-23', 10, 'teacher') $$,
  '23514', null, 'cannot log practice for another studio''s student');
select lives_ok($$ insert into public.client_note (studio_id, subject_type, subject_id, body, category, visibility, author_name)
  values (current_setting('test.studio_x')::uuid, 'student', current_setting('test.student_x')::uuid, 'Lovely tone', 'lesson', 'shared', 'Teacher X') $$,
  'teacher X writes a shared lesson note');
select lives_ok($$ insert into public.client_note (studio_id, subject_type, subject_id, body, author_name)
  values (current_setting('test.studio_x')::uuid, 'family', current_setting('test.family_x')::uuid, 'Private: fees', 'Teacher X') $$,
  'teacher X writes a private family note');
select is((select visibility from public.client_note where body = 'Private: fees'), 'private', 'notes are private unless shared');
select throws_ok($$ insert into public.client_note (studio_id, subject_type, subject_id, body, author_name)
  values (current_setting('test.studio_x')::uuid, 'family', current_setting('test.family_y')::uuid, 'Wrong family', 'Teacher X') $$,
  '23514', null, 'cannot write a note about another studio''s family');
select throws_ok($$ update public.client_note set subject_id = current_setting('test.student_y')::uuid where body = 'Lovely tone' $$,
  '23514', null, 'a note cannot move to another student');
select lives_ok($$ update public.client_note set pinned = true where body = 'Lovely tone' $$, 'teacher X pins a note');
select pn_reset();

-- Families read nothing directly (their copy comes from the server); other studios see nothing.
select pn_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.practice_log), 0, 'guardian reads no practice rows');
select is((select count(*)::int from public.client_note), 0, 'guardian reads no notes, shared or private');
select throws_ok($$ insert into public.practice_log (studio_id, student_id, practice_date, minutes, logged_by)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-23', 10, 'parent') $$,
  '42501', null, 'guardian cannot insert practice directly');
select pn_reset();
select pn_as(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.practice_log), 0, 'owner Y sees no studio X practice');
select is((select count(*)::int from public.client_note), 0, 'owner Y sees no studio X notes');
select throws_ok($$ insert into public.client_note (studio_id, subject_type, subject_id, body, author_name)
  values (current_setting('test.studio_x')::uuid, 'student', current_setting('test.student_x')::uuid, 'Intruder', 'Owner Y') $$,
  '42501', null, 'owner Y cannot write into studio X');
select pn_reset();

-- Paused studio: owner reads, nobody writes.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select pn_as(current_setting('test.owner_x')::uuid);
select is((select count(*)::int from public.client_note), 2, 'paused owner can still read notes');
select throws_ok($$ insert into public.practice_log (studio_id, student_id, practice_date, minutes, logged_by)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-24', 10, 'teacher') $$,
  '42501', null, 'paused studio cannot log practice');
select pn_reset();

-- Deleting a student removes their practice and the notes about them.
delete from public.student where id = current_setting('test.student_x')::uuid;
select is((select count(*)::int from public.practice_log where studio_id = current_setting('test.studio_x')::uuid), 0, 'practice goes with the student');
select is((select count(*)::int from public.client_note where subject_type = 'student' and studio_id = current_setting('test.studio_x')::uuid), 0, 'student notes go with the student');
select is((select count(*)::int from public.client_note where subject_type = 'family' and studio_id = current_setting('test.studio_x')::uuid), 1, 'family notes stay while the family does');

select finish();
rollback;
