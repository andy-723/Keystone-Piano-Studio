-- pgTAP tests for 0019 student progress snapshots. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c6000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c6000000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'd6000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c6000000-0000-4000-8000-000000000009', true);

create or replace function snap_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function snap_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Snap X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Snap Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);

-- Teacher X writes this week's snapshot and updates it later the same week.
select snap_as(current_setting('test.teacher_x')::uuid);
select lives_ok($$ insert into public.student_progress_snapshot (studio_id, student_id, week_start, level, target_term, readiness_pct, sections)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-09', 'Grade 2', '2027-T2', 40, '[{"name":"Repertoire","pct":40,"done":0,"total":3}]') $$,
  'teacher X writes a weekly snapshot');
select lives_ok($$ insert into public.student_progress_snapshot (studio_id, student_id, week_start, readiness_pct)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-09', 45)
  on conflict (student_id, week_start) do update set readiness_pct = excluded.readiness_pct $$,
  'same week upserts');
select is((select readiness_pct::int from public.student_progress_snapshot where student_id = current_setting('test.student_x')::uuid), 45, 'one row per student per week');
select throws_ok($$ insert into public.student_progress_snapshot (studio_id, student_id, week_start, readiness_pct)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-10', 50) $$,
  '23514', null, 'week_start must be a Monday');
select throws_ok($$ insert into public.student_progress_snapshot (studio_id, student_id, week_start, readiness_pct)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-16', 101) $$,
  '23514', null, 'readiness is 0 to 100');
select throws_ok($$ insert into public.student_progress_snapshot (studio_id, student_id, week_start, readiness_pct)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_y')::uuid, '2026-11-16', 10) $$,
  '23514', null, 'cannot point at another studio''s student');
select throws_ok($$ update public.student_progress_snapshot set student_id = gen_random_uuid() where student_id = current_setting('test.student_x')::uuid $$,
  '23514', null, 'a snapshot cannot move to another student');
select snap_reset();

-- Families and other studios see nothing.
select snap_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.student_progress_snapshot), 0, 'guardian reads no snapshots');
select snap_reset();
select snap_as(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.student_progress_snapshot), 0, 'owner Y sees no studio X snapshots');
select throws_ok($$ insert into public.student_progress_snapshot (studio_id, student_id, week_start, readiness_pct)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-16', 10) $$,
  '42501', null, 'owner Y cannot write into studio X');
select snap_reset();

-- Paused studio: owner reads, nobody writes.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select snap_as(current_setting('test.owner_x')::uuid);
select is((select count(*)::int from public.student_progress_snapshot), 1, 'paused owner can still read history');
select throws_ok($$ insert into public.student_progress_snapshot (studio_id, student_id, week_start, readiness_pct)
  values (current_setting('test.studio_x')::uuid, current_setting('test.student_x')::uuid, '2026-11-16', 10) $$,
  '42501', null, 'paused studio cannot add snapshots');
select snap_reset();

-- Deleting a student removes their history.
delete from public.student where id = current_setting('test.student_x')::uuid;
select is((select count(*)::int from public.student_progress_snapshot where studio_id = current_setting('test.studio_x')::uuid), 0, 'history goes with the student');

select finish();
rollback;
