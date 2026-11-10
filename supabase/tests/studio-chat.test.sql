-- pgTAP tests for 0013 studio chat. Run with: supabase test db
begin;
select no_plan();
create extension if not exists pgtap with schema extensions;

select set_config('test.owner_x', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('test.owner_y', 'd1000000-0000-4000-8000-000000000001', true);
select set_config('test.guardian_x', 'c1000000-0000-4000-8000-000000000009', true);
select set_config('test.guardian_x2', 'c1000000-0000-4000-8000-000000000008', true);

create or replace function chat_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;
create or replace function chat_reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

select set_config('test.studio_x', app_private.create_studio_with_owner('Chat X', 'Australia/Melbourne', current_setting('test.owner_x')::uuid, null)::text, true);
select set_config('test.studio_y', app_private.create_studio_with_owner('Chat Y', 'Australia/Melbourne', current_setting('test.owner_y')::uuid, null)::text, true);
update public.studio_subscription set status = 'comp', plan = 'pro'
 where studio_id in (current_setting('test.studio_x')::uuid, current_setting('test.studio_y')::uuid);

-- Two families in X, each with a signed-in guardian.
insert into public.family (id, studio_id, display_name) values
  ('c2000000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, 'Family One'),
  ('c2000000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, 'Family Two');
insert into public.guardian (family_id, user_id, full_name, email) values
  ('c2000000-0000-4000-8000-000000000001', current_setting('test.guardian_x')::uuid, 'Parent One', 'one@example.com'),
  ('c2000000-0000-4000-8000-000000000002', current_setting('test.guardian_x2')::uuid, 'Parent Two', 'two@example.com');

-- Owner X starts both family chats and posts.
select chat_as(current_setting('test.owner_x')::uuid);
select lives_ok($$ insert into public.conversation (id, studio_id, family_id) values
  ('c3000000-0000-4000-8000-000000000001', current_setting('test.studio_x')::uuid, 'c2000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-000000000002', current_setting('test.studio_x')::uuid, 'c2000000-0000-4000-8000-000000000002') $$,
  'owner X starts family chats');
select lives_ok($$ insert into public.message (studio_id, conversation_id, author_user_id, author_role, author_name, kind, body)
  values (current_setting('test.studio_x')::uuid, 'c3000000-0000-4000-8000-000000000001', current_setting('test.owner_x')::uuid, 'teacher', 'Ms X', 'text', 'Hello family one') $$,
  'owner X posts as themselves');
select throws_ok($$ insert into public.message (studio_id, conversation_id, author_user_id, author_role, author_name, kind, body)
  values (current_setting('test.studio_x')::uuid, 'c3000000-0000-4000-8000-000000000001', current_setting('test.owner_x')::uuid, 'guardian', 'Fake parent', 'text', 'spoof') $$,
  '42501', null, 'staff cannot post as a guardian');
select throws_ok($$ update public.message set body = 'edited' where conversation_id = 'c3000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a sent message cannot be edited');
select lives_ok($$ update public.message set read_at = now() where conversation_id = 'c3000000-0000-4000-8000-000000000001' $$,
  'read_at can be set');
select chat_reset();

select is((select last_message_at > now() - interval '1 minute' from public.conversation where id = 'c3000000-0000-4000-8000-000000000001'), true,
  'a new message moves the conversation up');

-- Guardian One sees only their own family's chat and posts as a guardian.
select chat_as(current_setting('test.guardian_x')::uuid);
select is((select count(*)::int from public.conversation), 1, 'guardian sees only their family chat');
select is((select count(*)::int from public.message), 1, 'guardian sees only their family messages');
select lives_ok($$ insert into public.message (conversation_id, author_user_id, author_role, author_name, kind, body)
  values ('c3000000-0000-4000-8000-000000000001', current_setting('test.guardian_x')::uuid, 'guardian', 'Parent One', 'text', 'Thanks!') $$,
  'guardian replies in their family chat');
select throws_ok($$ insert into public.message (conversation_id, author_user_id, author_role, author_name, kind, body)
  values ('c3000000-0000-4000-8000-000000000002', current_setting('test.guardian_x')::uuid, 'guardian', 'Parent One', 'text', 'wrong family') $$,
  '42501', null, 'guardian cannot post in another family chat');
select throws_ok($$ insert into public.message (conversation_id, author_user_id, author_role, author_name, kind, body)
  values ('c3000000-0000-4000-8000-000000000001', current_setting('test.guardian_x')::uuid, 'teacher', 'Ms X', 'text', 'spoof') $$,
  '42501', null, 'guardian cannot post as the teacher');
select chat_reset();

-- Owner Y sees nothing of studio X.
select chat_as(current_setting('test.owner_y')::uuid);
select is((select count(*)::int from public.conversation), 0, 'owner Y sees no studio X chats');
select is((select count(*)::int from public.message), 0, 'owner Y sees no studio X messages');
select throws_ok($$ insert into public.message (studio_id, conversation_id, author_user_id, author_role, author_name, kind, body)
  values (current_setting('test.studio_x')::uuid, 'c3000000-0000-4000-8000-000000000001', current_setting('test.owner_y')::uuid, 'teacher', 'Y', 'text', 'intrude') $$,
  '42501', null, 'owner Y cannot post into studio X');
select chat_reset();

-- Paused studio: owner reads, nobody posts.
update public.studio_subscription set status = 'suspended' where studio_id = current_setting('test.studio_x')::uuid;
select chat_as(current_setting('test.owner_x')::uuid);
select is((select count(*)::int from public.message), 2, 'paused owner can still read chat');
select throws_ok($$ insert into public.message (studio_id, conversation_id, author_user_id, author_role, author_name, kind, body)
  values (current_setting('test.studio_x')::uuid, 'c3000000-0000-4000-8000-000000000001', current_setting('test.owner_x')::uuid, 'teacher', 'Ms X', 'text', 'paused') $$,
  '42501', null, 'paused studio cannot post');
select chat_reset();

select finish();
rollback;
