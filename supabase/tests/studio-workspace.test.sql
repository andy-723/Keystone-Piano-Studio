-- pgTAP tests for 0011 studio workspace. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c0000000-0000-4000-8000-000000000001', true);
select set_config('test.owner_y', 'd0000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c0000000-0000-4000-8000-000000000002', true);

create or replace function ws_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;

create or replace function ws_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

-- Two studios made the way the admin console makes them.
select set_config('test.studio_x', app_private.create_studio_with_owner('Studio X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Studio Y', 'Australia/Sydney', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role)
values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);

select is(
  (select count(*)::int from public.student where studio_id = current_setting('test.studio_x')::uuid and is_example),
  1, 'a new studio starts with one example student');
select is(
  (select count(*)::int from public.student where studio_id = current_setting('test.studio_x')::uuid),
  1, 'and nothing else');
select is(
  (select count(*)::int from public.family where studio_id = current_setting('test.studio_x')::uuid and is_example),
  1, 'the example student has an example family');
select is(
  app_private.seed_example_student(current_setting('test.studio_x')::uuid), null,
  'seeding again does nothing once the studio has a student');
select is(
  (select is_demo from public.studio where id = current_setting('test.studio_x')::uuid), false,
  'new studios are not the demo');

-- Owner X sees and edits only studio X.
select ws_as(current_setting('test.owner_x')::uuid);
select is(
  (select count(*)::int from public.student), 1, 'owner X sees exactly their own example student');
select is(
  (select count(*)::int from public.family where studio_id = current_setting('test.studio_y')::uuid), 0,
  'owner X sees no families from studio Y');
select lives_ok(
  $$ update public.studio set name = 'Studio X renamed', profile = '{"teacher":{"name":"Ms X"}}'::jsonb
     where id = current_setting('test.studio_x')::uuid $$,
  'owner X can save their studio details');
select throws_ok(
  $$ update public.studio set is_demo = true where id = current_setting('test.studio_x')::uuid $$,
  '42501', null, 'owner X cannot turn their studio into the demo');
select throws_ok(
  $$ update public.studio set profile = '[]'::jsonb where id = current_setting('test.studio_x')::uuid $$,
  '23514', null, 'profile must be a JSON object');
update public.studio set name = 'hijack' where id = current_setting('test.studio_y')::uuid;
select lives_ok(
  $$ insert into public.family (id, studio_id, display_name) values ('c1111111-1111-4111-8111-111111111111', current_setting('test.studio_x')::uuid, 'Real family') $$,
  'owner X can add a family');
select lives_ok(
  $$ insert into public.student (family_id, studio_id, first_name, last_name, birth_year, grade_goal) values ('c1111111-1111-4111-8111-111111111111', current_setting('test.studio_x')::uuid, 'Real', 'Student', 2015, 'Grade 1') $$,
  'owner X can add a student');
select throws_ok(
  $$ insert into public.family (studio_id, display_name) values (current_setting('test.studio_y')::uuid, 'Sneaky') $$,
  '42501', null, 'owner X cannot add a family to studio Y');
select lives_ok(
  $$ delete from public.family where studio_id = current_setting('test.studio_x')::uuid and is_example $$,
  'owner X can delete the example family');
select is(
  (select count(*)::int from public.student where is_example), 0, 'the example student went with it');
select is(
  (select count(*)::int from public.student), 1, 'the real student stays');
select ws_reset();

-- Teacher X can read the studio but not edit its details (0003 studio_update is owner/admin).
select ws_as(current_setting('test.teacher_x')::uuid);
select is(
  (select name from public.studio where id = current_setting('test.studio_x')::uuid), 'Studio X renamed',
  'teacher X reads the saved studio name');
update public.studio set name = 'teacher edit' where id = current_setting('test.studio_x')::uuid;
select ws_reset();
select is(
  (select name from public.studio where id = current_setting('test.studio_y')::uuid), 'Studio Y',
  'owner X could not change studio Y');
select is(
  (select name from public.studio where id = current_setting('test.studio_x')::uuid), 'Studio X renamed',
  'teacher X could not change studio details');

-- Platform staff (service role / SQL editor) can mark the demo studio.
select lives_ok(
  $$ update public.studio set is_demo = true where id = current_setting('test.studio_y')::uuid $$,
  'Keystone can mark a studio as the demo');

select finish();
rollback;
