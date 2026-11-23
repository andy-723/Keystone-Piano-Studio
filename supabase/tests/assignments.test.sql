-- pgTAP tests for 0026 assignments and marking. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c8000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c8000000-0000-4000-8000-000000000002', true);
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

select set_config('test.studio_x', app_private.create_studio_with_owner('Tasks X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Tasks Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'base'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
-- The starter student is an example (no emails); treat it as a real one for the summary check.
update public.student set is_example = false where studio_id = current_setting('test.studio_x')::uuid;
update public.family set is_example = false where studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);
select set_config('test.assignment_x', 'c8000000-0000-4000-8000-0000000000a1', true);
select set_config('test.task_1', 'c8000000-0000-4000-8000-0000000000b1', true);
select set_config('test.task_2', 'c8000000-0000-4000-8000-0000000000b2', true);
select set_config('test.practice_1', 'c8000000-0000-4000-8000-0000000000c1', true);

-- Teacher X sets two tasks at a lesson (a Base studio: assignments are in every plan).
select as_user(current_setting('test.teacher_x')::uuid);
select lives_ok($$ insert into public.assignment (id, studio_id, student_id, occurrence_key, lesson_date, due_date)
  values (current_setting('test.assignment_x')::uuid, current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, 'series_2026-11-23', '2026-11-23', '2026-11-29') $$,
  'teacher X sets an assignment');
select throws_ok($$ insert into public.assignment (studio_id, student_id, occurrence_key, lesson_date, due_date)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, 'series_2026-11-23', '2026-11-23', '2026-11-29') $$,
  '23505', null, 'one assignment per lesson');
select throws_ok($$ insert into public.assignment (studio_id, student_id, lesson_date, due_date)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-23', '2026-11-20') $$,
  '23514', null, 'due date cannot be before the lesson');
select throws_ok($$ insert into public.assignment (studio_id, student_id, lesson_date, due_date)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_y')::uuid, '2026-11-23', '2026-11-29') $$,
  '23514', null, 'cannot set an assignment for another studio''s student');
select lives_ok($$ insert into public.assignment_task (id, studio_id, assignment_id, position, text, minutes_per_day, days_per_week, attachment_title, attachment_url) values
  (current_setting('test.task_1')::uuid, current_setting('test.studio_x')::uuid, current_setting('test.assignment_x')::uuid, 0, 'Scales C major', 10, 5, 'Scale sheet', 'https://example.com/scales'),
  (current_setting('test.task_2')::uuid, current_setting('test.studio_x')::uuid, current_setting('test.assignment_x')::uuid, 1, 'Minuet bars 1-8', 15, 5, null, null) $$,
  'teacher X adds two tasks');
select throws_ok($$ insert into public.assignment_task (studio_id, assignment_id, position, text, minutes_per_day, days_per_week, attachment_url)
  values (current_setting('test.studio_x')::uuid, current_setting('test.assignment_x')::uuid, 2, 'Bad link', 10, 5, 'javascript:alert(1)') $$,
  '23514', null, 'attachment links must be https');
select throws_ok($$ insert into public.assignment_task (studio_id, assignment_id, position, text, minutes_per_day, days_per_week)
  values (current_setting('test.studio_x')::uuid, current_setting('test.assignment_x')::uuid, 2, 'Too long', 10, 8) $$,
  '23514', null, 'days per week is 1 to 7');
select throws_ok($$ update public.assignment_task set mark_comment = 'Nice' where id = current_setting('test.task_2')::uuid $$,
  '23514', null, 'a comment needs a mark');
select as_reset();

-- The family ticks task 1 off through the server (service role), which logs practice.
insert into public.practice_log (id, studio_id, student_id, practice_date, minutes, logged_by, logged_by_user_id)
values (current_setting('test.practice_1')::uuid, current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-24', 10, 'parent', current_setting('test.guardian_x')::uuid);
update public.assignment_task set done_at = now(), done_by = 'parent', practice_log_id = current_setting('test.practice_1')::uuid
 where id = current_setting('test.task_1')::uuid;
select is((select done_by from public.assignment_task where id = current_setting('test.task_1')::uuid), 'parent', 'task ticked off');

-- Families read nothing directly; other studios see nothing and cannot write.
select as_user(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.assignment), 0, 'guardian reads no assignments directly');
select is((select count(*)::int from public.assignment_task), 0, 'guardian reads no tasks directly');
select as_reset();
select as_user(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.assignment_task), 0, 'owner Y sees no studio X tasks');
select throws_ok($$ insert into public.assignment (studio_id, student_id, lesson_date, due_date)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-23', '2026-11-29') $$,
  '42501', null, 'owner Y cannot write into studio X');
select as_reset();

-- Teacher X marks both tasks; the unlinked marks count towards the 7am summary.
select as_user(current_setting('test.teacher_x')::uuid);
select lives_ok($$ update public.assignment_task set mark = 'done_well', mark_comment = 'Even and steady', marked_at = now(), marked_by = auth.uid()
  where assignment_id = current_setting('test.assignment_x')::uuid $$, 'teacher X marks the tasks');
select lives_ok($$ update public.assignment set marked_at = now() where id = current_setting('test.assignment_x')::uuid $$, 'assignment marked');
select as_reset();
select is((select feedback_count from public.notify_marking_candidates(now() - interval '1 hour')
  where student_id = current_setting('test.student_x')::uuid), 2, 'marked tasks count in the daily summary');

-- Deleting the practice entry un-ticks the task it ticked.
select as_user(current_setting('test.teacher_x')::uuid);
select lives_ok($$ delete from public.practice_log where id = current_setting('test.practice_1')::uuid $$, 'teacher X deletes a practice entry');
select as_reset();
select is((select done_at from public.assignment_task where id = current_setting('test.task_1')::uuid), null, 'task un-ticked when its practice is deleted');
select is((select practice_log_id from public.assignment_task where id = current_setting('test.task_1')::uuid), null, 'practice link cleared');

-- Paused studio: nobody writes.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select as_user(current_setting('test.owner_x')::uuid);
select is((select count(*)::int from public.assignment), 1, 'paused owner can still read assignments');
select throws_ok($$ insert into public.assignment (studio_id, student_id, lesson_date, due_date)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-30', '2026-12-06') $$,
  '42501', null, 'paused studio cannot set assignments');
select as_reset();

-- Deleting the student removes their assignments and tasks.
delete from public.student where id = current_setting('test.student_x')::uuid;
select is((select count(*)::int from public.assignment_task where studio_id = current_setting('test.studio_x')::uuid), 0, 'tasks go with the student');

select finish();
rollback;
