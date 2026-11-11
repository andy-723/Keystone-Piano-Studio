-- pgTAP tests for 0018 notification emails. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c8000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c8000000-0000-4000-8000-000000000009', true);
select set_config('test.guardian_z', 'c8000000-0000-4000-8000-00000000000a', true);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('test.owner_x')::uuid, 'authenticated', 'authenticated', 'owner-x@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('test.guardian_x')::uuid, 'authenticated', 'authenticated', 'parent-x@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('test.guardian_z')::uuid, 'authenticated', 'authenticated', 'parent-z@example.com', now(), now());

create or replace function notify_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function notify_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Notify X', 'Australia/Sydney', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_demo', app_private.create_studio_with_owner('Notify Demo', 'Australia/Sydney', current_setting('test.owner_x')::uuid, null)::text, true);
update public.studio set is_demo = true where id = current_setting('test.studio_demo')::uuid;

-- Real family (not the example one) with a signed-up guardian and a student.
insert into public.family (id, studio_id, display_name) values
  ('c8100000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, 'Nguyen family'),
  ('c8100000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, 'Smith family');
insert into public.guardian (family_id, studio_id, user_id, full_name, email) values
  ('c8100000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, current_setting('test.guardian_x')::uuid, 'Parent X', 'parent-x@example.com'),
  ('c8100000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, current_setting('test.guardian_z')::uuid, 'Parent Z', 'parent-z@example.com'),
  ('c8100000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, null, 'Not signed up', 'nobody@example.com');
insert into public.student (id, family_id, studio_id, first_name, last_name, birth_year) values
  ('c8200000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, 'Edi', 'Nguyen', 2016);

-- Chat: an old unread teacher message, a fresh one, and an old unread family message.
insert into public.conversation (id, studio_id, family_id) values
  ('c8300000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, 'c8100000-0000-4000-8000-000000000001'),
  ('c8300000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, 'c8100000-0000-4000-8000-000000000002');
insert into public.message (id, conversation_id, author_user_id, author_role, author_name, kind, body, sent_at) values
  ('c8400000-0000-4000-8000-000000000001', 'c8300000-0000-4000-8000-000000000001', current_setting('test.owner_x')::uuid, 'teacher', 'Ms X', 'text', 'Lesson moved', now() - interval '30 minutes'),
  ('c8400000-0000-4000-8000-000000000002', 'c8300000-0000-4000-8000-000000000001', current_setting('test.owner_x')::uuid, 'teacher', 'Ms X', 'text', 'Also...', now() - interval '20 minutes'),
  ('c8400000-0000-4000-8000-000000000003', 'c8300000-0000-4000-8000-000000000002', current_setting('test.guardian_z')::uuid, 'guardian', 'Parent Z', 'text', 'Question', now() - interval '5 minutes'),
  ('c8400000-0000-4000-8000-000000000004', 'c8300000-0000-4000-8000-000000000001', current_setting('test.guardian_x')::uuid, 'guardian', 'Parent X', 'text', 'Thanks', now() - interval '40 minutes');

select is((select count(*)::int from public.notify_chat_candidates('15 minutes', '3 days') where direction = 'to_family'), 1,
  'teacher messages unread for 15 minutes go to the signed-up guardian once');
select is((select unread_count from public.notify_chat_candidates('15 minutes', '3 days') where direction = 'to_family'), 2,
  'the email counts every unread message in that chat');
select is((select oldest_unread_id::text from public.notify_chat_candidates('15 minutes', '3 days') where direction = 'to_family'), 'c8400000-0000-4000-8000-000000000001',
  'the key is the oldest unread message');
select is((select recipient_email from public.notify_chat_candidates('15 minutes', '3 days') where direction = 'to_studio'), 'owner-x@example.com',
  'a family message unread for 15 minutes goes to the studio owner');
select is((select count(*)::int from public.notify_chat_candidates('15 minutes', '3 days') where family_id = 'c8100000-0000-4000-8000-000000000002'), 0,
  'a message newer than 15 minutes waits');

insert into public.notification_log (user_id, studio_id, kind, dedupe_key, status) values
  (current_setting('test.guardian_x')::uuid, current_setting('test.studio_x')::uuid, 'chat', 'c8400000-0000-4000-8000-000000000001', 'sent');
select is((select count(*)::int from public.notify_chat_candidates('15 minutes', '3 days') where direction = 'to_family'), 0,
  'once emailed, the chat is not emailed again until read');
select throws_ok($$ insert into public.notification_log (user_id, studio_id, kind, dedupe_key) values
  (current_setting('test.guardian_x')::uuid, current_setting('test.studio_x')::uuid, 'chat', 'c8400000-0000-4000-8000-000000000001') $$,
  '23505', null, 'the log stops a double send');

-- Preference off: no candidates.
insert into public.notification_preference (user_id, chat_email) values (current_setting('test.owner_x')::uuid, false);
select is((select count(*)::int from public.notify_chat_candidates('15 minutes', '3 days') where direction = 'to_studio'), 0,
  'chat emails switched off means none');

-- News: important to everyone; families-only post reaches only that family; demo studio never.
insert into public.news_post (id, studio_id, author_user_id, author_name, title, body, important, status, publish_at, audience) values
  ('c8500000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, current_setting('test.owner_x')::uuid, 'Ms X', 'Concert', 'Body', true, 'published', now() - interval '1 hour', '{"kind":"studio"}'),
  ('c8500000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, current_setting('test.owner_x')::uuid, 'Ms X', 'Smiths only', 'Body', false, 'published', now() - interval '1 hour', '{"kind":"families","familyIds":["c8100000-0000-4000-8000-000000000002"]}'),
  ('c8500000-0000-4000-8000-000000000003', current_setting('test.studio_x')::uuid, current_setting('test.owner_x')::uuid, 'Ms X', 'Later', 'Body', true, 'scheduled', now() + interval '1 day', '{"kind":"studio"}'),
  ('c8500000-0000-4000-8000-000000000004', current_setting('test.studio_demo')::uuid, current_setting('test.owner_x')::uuid, 'Ms X', 'Demo', 'Body', true, 'published', now() - interval '1 hour', '{"kind":"studio"}');
select is((select count(*)::int from public.notify_news_candidates(now() - interval '2 days') where post_id = 'c8500000-0000-4000-8000-000000000001'), 2,
  'a whole-studio post reaches both signed-up guardians');
select is((select array_agg(recipient_email) from public.notify_news_candidates(now() - interval '2 days') where post_id = 'c8500000-0000-4000-8000-000000000002'), array['parent-z@example.com'],
  'a families post reaches only those families');
select is((select count(*)::int from public.notify_news_candidates(now() - interval '2 days') where post_id in ('c8500000-0000-4000-8000-000000000003', 'c8500000-0000-4000-8000-000000000004')), 0,
  'future posts and demo studios are not emailed');

-- Marking: only feedback shared with the family counts.
insert into public.student_course (studio_id, student_id, data) values
  (current_setting('test.studio_x')::uuid, 'c8200000-0000-4000-8000-000000000001',
   jsonb_build_object('feedback', jsonb_build_array(
     jsonb_build_object('id', 'f1', 'shared', true, 'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
     jsonb_build_object('id', 'f2', 'shared', false, 'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
     jsonb_build_object('id', 'f3', 'shared', true, 'createdAt', '2020-01-01T00:00:00Z'))));
select is((select feedback_count from public.notify_marking_candidates(now() - interval '1 day')), 1,
  'only new feedback shared with the family is counted');

-- People manage only their own switches; the token cannot be chosen or changed.
select notify_as(current_setting('test.guardian_x')::uuid);
select lives_ok($$ insert into public.notification_preference (user_id, unsubscribe_token, news_email)
  values (current_setting('test.guardian_x')::uuid, '00000000-0000-4000-8000-000000000000', false) $$, 'a guardian saves their own switches');
select isnt((select unsubscribe_token::text from public.notification_preference), '00000000-0000-4000-8000-000000000000', 'the token is not chosen by the person');
select is((select count(*)::int from public.notification_preference), 1, 'a person sees only their own switches');
select throws_ok($$ insert into public.notification_preference (user_id) values (current_setting('test.guardian_z')::uuid) $$,
  '42501', null, 'nobody can save switches for someone else');
select throws_ok($$ select count(*) from public.notification_log $$, '42501', null, 'the sent log is service-only');
select throws_ok($$ select * from public.notify_chat_candidates('15 minutes', '3 days') $$, '42501', null, 'candidate lists are service-only');
select notify_reset();

select is((select count(*)::int from public.notify_news_candidates(now() - interval '2 days') where recipient_user_id = current_setting('test.guardian_x')::uuid), 0,
  'news switched off means no news emails');

-- Unsubscribe link.
select is(public.notify_unsubscribe((select unsubscribe_token from public.notification_preference where user_id = current_setting('test.guardian_x')::uuid), 'summary'), true,
  'the token unsubscribes');
select is((select marking_email from public.notification_preference where user_id = current_setting('test.guardian_x')::uuid), false,
  'summary turns off news and feedback');
select is((select chat_email from public.notification_preference where user_id = current_setting('test.guardian_x')::uuid), true,
  'summary leaves chat on');
select is(public.notify_unsubscribe(gen_random_uuid(), 'all'), false, 'an unknown token does nothing');

select * from finish();
rollback;
