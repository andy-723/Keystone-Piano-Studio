-- pgTAP tests for 0014 studio news. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c4000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher_x', 'c4000000-0000-4000-8000-000000000002', true);
select set_config('test.owner_y', 'd4000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c4000000-0000-4000-8000-000000000009', true);

create or replace function news_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function news_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('News X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('News Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
insert into public.studio_member (studio_id, user_id, role) values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'teacher');
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);
insert into public.guardian (family_id, user_id, full_name, email)
select f.id, current_setting('test.guardian_x')::uuid, 'Parent X', 'px@example.com'
from public.family f where f.studio_id = current_setting('test.studio_x')::uuid;
select set_config('test.student_x', (select id::text from public.student where studio_id = current_setting('test.studio_x')::uuid), true);
select set_config('test.student_y', (select id::text from public.student where studio_id = current_setting('test.studio_y')::uuid), true);

select news_as(current_setting('test.owner_x')::uuid);
select lives_ok($$ insert into public.news_post (id, studio_id, author_user_id, author_name, title, body, status, publish_at)
  values ('c4100000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, current_setting('test.owner_x')::uuid, 'Owner X', 'Welcome', 'Hi', 'published', now()) $$,
  'owner X posts news');
select throws_ok($$ insert into public.news_post (studio_id, author_user_id, author_name, title, body, status, publish_at)
  values (current_setting('test.studio_x')::uuid, current_setting('test.teacher_x')::uuid, 'Teacher X', 'Spoof', 'Hi', 'published', now()) $$,
  '42501', null, 'owner X cannot post as someone else');
select lives_ok($$ insert into public.student_group (studio_id, name, student_ids)
  values (current_setting('test.studio_x')::uuid, 'Beginners', array[current_setting('test.student_x')::uuid]) $$,
  'owner X makes a group of their students');
select throws_ok($$ insert into public.student_group (studio_id, name, student_ids)
  values (current_setting('test.studio_x')::uuid, 'Poach', array[current_setting('test.student_y')::uuid]) $$,
  '23514', null, 'a group cannot hold another studio''s student');
select news_reset();

select news_as(current_setting('test.teacher_x')::uuid);
select is((select count(*)::int from public.news_post), 1, 'teacher X reads studio news');
update public.news_post set title = 'Changed by teacher' where id = 'c4100000-0000-4000-8000-000000000001';
select news_reset();
select is((select title from public.news_post where id = 'c4100000-0000-4000-8000-000000000001'), 'Welcome',
  'teacher X cannot edit the owner''s post');

select news_as(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.news_post), 0, 'owner Y sees no studio X news');
select is((select count(*)::int from public.student_group), 0, 'owner Y sees no studio X groups');
select news_reset();

select news_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.news_post), 0, 'guardians read no news rows yet (family portal later)');
select is((select count(*)::int from public.student_group), 0, 'guardians read no groups');
select news_reset();

select finish();
rollback;
