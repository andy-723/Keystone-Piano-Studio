-- pgTAP tests for 0025 attendance and make-up credits. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'a7250000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'a7250000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'b7250000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'a7250000-0000-4000-8000-000000000009', true);

insert into auth.users (id, email)
values (current_setting('test.owner_x')::uuid, 'am-owner-x@example.com'),
       (current_setting('test.teacher_x')::uuid, 'am-teacher-x@example.com'),
       (current_setting('test.owner_y')::uuid, 'am-owner-y@example.com'),
       (current_setting('test.guardian_x')::uuid, 'am-guardian-x@example.com')
on conflict (id) do nothing;

create or replace function am_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function am_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Marks X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Marks Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'amx@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);

-- The server (service key) saves a weekly lesson, a studio cancellation and its credit.
insert into public.lesson_series (studio_id, student_id, teacher_user_id, repeat, first_date, start_time, duration_min)
values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, current_setting('test.teacher_x')::uuid, 'weekly', '2026-11-03', '16:00', 30);
select set_config('test.series_x', (select id::text from public.lesson_series where studio_id = current_setting('test.studio_x')::uuid), true);
select lives_ok($$ insert into public.lesson_attendance (studio_id, student_id, series_id, occurrence_key, lesson_date, status, credit)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, current_setting('test.series_x')::uuid,
          current_setting('test.series_x') || '_2026-11-17', '2026-11-17', 'cancelled_by_studio', true) $$,
  'server saves a lesson mark');
select lives_ok($$ insert into public.makeup_credit (studio_id, student_id, amount, reason, occurrence_key, expires_on)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, 1, 'studio_cancel',
          current_setting('test.series_x') || '_2026-11-17', '2027-02-15') $$,
  'server adds a credit');
select throws_ok($$ insert into public.lesson_attendance (studio_id, student_id, occurrence_key, lesson_date, status)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_y')::uuid, 'x_2026-11-17', '2026-11-17', 'attended') $$,
  '23514', null, 'a mark cannot be for another studio''s student');
select throws_ok($$ insert into public.makeup_credit (studio_id, student_id, amount, reason, occurrence_key, expires_on)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_y')::uuid, 1, 'goodwill', 'x', '2027-01-01') $$,
  '23514', null, 'a credit cannot be for another studio''s student');
select throws_ok($$ update public.makeup_credit set expires_on = '2030-01-01' $$,
  '42501', null, 'credit history cannot be edited');
select throws_ok($$ delete from public.makeup_credit $$,
  '42501', null, 'credit history cannot be deleted');

-- Staff of studio X read; nobody writes directly.
select am_as(current_setting('test.teacher_x')::uuid);
select is((select count(*)::int from public.lesson_attendance), 1, 'teacher X reads the mark');
select is((select count(*)::int from public.makeup_credit), 1, 'teacher X reads the credit');
select throws_ok($$ insert into public.lesson_attendance (studio_id, student_id, occurrence_key, lesson_date, status)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, 'k_2026-11-10', '2026-11-10', 'attended') $$,
  '42501', null, 'staff cannot write marks directly (server only)');
select throws_ok($$ insert into public.makeup_credit (studio_id, student_id, amount, reason, occurrence_key, expires_on)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, 1, 'goodwill', 'k', '2027-01-01') $$,
  '42501', null, 'staff cannot add credits directly (server only)');
select am_reset();

-- Families and other studios see nothing.
select am_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.lesson_attendance), 0, 'guardian reads no marks');
select is((select count(*)::int from public.makeup_credit), 0, 'guardian reads no credits');
select am_reset();
select am_as(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.lesson_attendance), 0, 'owner Y sees no studio X marks');
select is((select count(*)::int from public.makeup_credit), 0, 'owner Y sees no studio X credits');
select am_reset();

-- Deleting the lesson keeps the mark as history; deleting the student removes everything.
delete from public.lesson_series where id = current_setting('test.series_x')::uuid;
select is((select count(*)::int from public.lesson_attendance where series_id is null), 1, 'mark kept when the lesson is deleted');
delete from public.student where id = current_setting('test.student_x')::uuid;
select is((select count(*)::int from public.lesson_attendance), 0, 'marks go with the student');
select is((select count(*)::int from public.makeup_credit), 0, 'credits go with the student');

select finish();
rollback;
