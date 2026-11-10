-- pgTAP tenancy isolation tests. Run with: supabase test db
-- Matrix (allowed/refused) is also summarised in the PR description.

begin;
select no_plan();

-- Synthetic studios A and B with owner, admin, teacher; one family+guardian+student each;
-- removed user (was teacher in A); anonymous.

create extension if not exists pgtap with schema extensions;

-- Fixed UUIDs for readability
select set_config('test.studio_a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
select set_config('test.studio_b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
select set_config('test.owner_a', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('test.admin_a', 'a0000000-0000-4000-8000-000000000002', true);
select set_config('test.teacher_a', 'a0000000-0000-4000-8000-000000000003', true);
select set_config('test.guardian_a', 'a0000000-0000-4000-8000-000000000004', true);
select set_config('test.removed_a', 'a0000000-0000-4000-8000-000000000005', true);
select set_config('test.owner_b', 'b0000000-0000-4000-8000-000000000001', true);
select set_config('test.admin_b', 'b0000000-0000-4000-8000-000000000002', true);
select set_config('test.teacher_b', 'b0000000-0000-4000-8000-000000000003', true);
select set_config('test.guardian_b', 'b0000000-0000-4000-8000-000000000004', true);
select set_config('test.family_a', 'aa111111-1111-4111-8111-111111111111', true);
select set_config('test.family_b', 'bb111111-1111-4111-8111-111111111111', true);
select set_config('test.student_a', 'aa222222-2222-4222-8222-222222222222', true);
select set_config('test.student_b', 'bb222222-2222-4222-8222-222222222222', true);

-- Seed as postgres (service bootstrap path in trigger)
insert into public.studio (id, name) values
  (current_setting('test.studio_a')::uuid, 'Studio A'),
  (current_setting('test.studio_b')::uuid, 'Studio B');

-- 0006: new studios start with no subscription (owner read-only); these tests need full access.
update public.studio_subscription set status = 'active'
 where studio_id in (current_setting('test.studio_a')::uuid, current_setting('test.studio_b')::uuid);

insert into public.studio_member (studio_id, user_id, role) values
  (current_setting('test.studio_a')::uuid, current_setting('test.owner_a')::uuid, 'owner'),
  (current_setting('test.studio_a')::uuid, current_setting('test.admin_a')::uuid, 'admin'),
  (current_setting('test.studio_a')::uuid, current_setting('test.teacher_a')::uuid, 'teacher'),
  (current_setting('test.studio_b')::uuid, current_setting('test.owner_b')::uuid, 'owner'),
  (current_setting('test.studio_b')::uuid, current_setting('test.admin_b')::uuid, 'admin'),
  (current_setting('test.studio_b')::uuid, current_setting('test.teacher_b')::uuid, 'teacher');

insert into public.family (id, studio_id, display_name) values
  (current_setting('test.family_a')::uuid, current_setting('test.studio_a')::uuid, 'Family A'),
  (current_setting('test.family_b')::uuid, current_setting('test.studio_b')::uuid, 'Family B');

insert into public.guardian (id, family_id, studio_id, user_id, full_name, email) values
  (gen_random_uuid(), current_setting('test.family_a')::uuid, current_setting('test.studio_a')::uuid, current_setting('test.guardian_a')::uuid, 'Guardian A', 'a@example.com'),
  (gen_random_uuid(), current_setting('test.family_b')::uuid, current_setting('test.studio_b')::uuid, current_setting('test.guardian_b')::uuid, 'Guardian B', 'b@example.com');

insert into public.student (id, family_id, studio_id, first_name, last_name, birth_year) values
  (current_setting('test.student_a')::uuid, current_setting('test.family_a')::uuid, current_setting('test.studio_a')::uuid, 'Stu', 'A', 2015),
  (current_setting('test.student_b')::uuid, current_setting('test.family_b')::uuid, current_setting('test.studio_b')::uuid, 'Stu', 'B', 2016);

-- removed teacher was in A
insert into public.studio_member (studio_id, user_id, role)
values (current_setting('test.studio_a')::uuid, current_setting('test.removed_a')::uuid, 'teacher');
delete from public.studio_member
 where studio_id = current_setting('test.studio_a')::uuid
   and user_id = current_setting('test.removed_a')::uuid;

create or replace function test_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;

create or replace function test_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end;
$$;

create or replace function test_reset_role() returns void language plpgsql as $$
begin
  -- Back to the bootstrap identity: clear the signed-in user too, or triggers still see them.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'reset role';
end;
$$;

-- Helper: teacher A sees zero rows from studio B on family
select test_as(current_setting('test.teacher_a')::uuid);
select is(
  (select count(*)::int from public.family where studio_id = current_setting('test.studio_b')::uuid),
  0,
  'teacher A gets zero family rows from studio B'
);
select is(
  (select count(*)::int from public.student where studio_id = current_setting('test.studio_b')::uuid),
  0,
  'teacher A gets zero student rows from studio B'
);
select is(
  (select count(*)::int from public.guardian where studio_id = current_setting('test.studio_b')::uuid),
  0,
  'teacher A gets zero guardian rows from studio B'
);
select is(
  (select count(*)::int from public.invitation where studio_id = current_setting('test.studio_b')::uuid),
  0,
  'teacher A gets zero invitation rows from studio B'
);

-- Cannot insert family with B studio_id
select throws_ok(
  format(
    'insert into public.family (studio_id, display_name) values (%L::uuid, %L)',
    current_setting('test.studio_b'),
    'Forged'
  ),
  null,
  null,
  'teacher A cannot insert family with studio B id'
);

-- Cannot insert student with forged parent from B
select throws_ok(
  format(
    'insert into public.student (family_id, studio_id, first_name, last_name, birth_year) values (%L::uuid, %L::uuid, %L, %L, 2018)',
    current_setting('test.family_b'),
    current_setting('test.studio_a'),
    'X',
    'Y'
  ),
  'studio_id does not match parent studio',
  'child-table trigger rejects mismatched studio_id'
);

-- Guardian A sees only own family
select test_as(current_setting('test.guardian_a')::uuid);
select is(
  (select count(*)::int from public.family),
  1,
  'guardian A sees only their family'
);
select is(
  (select count(*)::int from public.student),
  1,
  'guardian A sees only their students'
);
select is(
  (select id = current_setting('test.family_a')::uuid from public.family limit 1),
  true,
  'guardian A family id is A'
);

-- Removed user sees nothing
select test_as(current_setting('test.removed_a')::uuid);
select is((select count(*)::int from public.family), 0, 'removed user sees no families');
select is((select count(*)::int from public.studio), 0, 'removed user sees no studios');
select is((select count(*)::int from public.studio_member), 0, 'removed user sees no memberships');

-- Teacher cannot change membership
select test_as(current_setting('test.teacher_a')::uuid);
select throws_ok(
  format(
    'insert into public.studio_member (studio_id, user_id, role) values (%L::uuid, %L::uuid, %L)',
    current_setting('test.studio_a'),
    'a0000000-0000-4000-8000-000000000099',
    'teacher'
  ),
  null,
  null,
  'teacher A cannot insert membership'
);

-- Admin cannot make anyone owner
select test_as(current_setting('test.admin_a')::uuid);
select throws_ok(
  format(
    'insert into public.studio_member (studio_id, user_id, role) values (%L::uuid, %L::uuid, %L)',
    current_setting('test.studio_a'),
    'a0000000-0000-4000-8000-000000000098',
    'owner'
  ),
  'Only an owner can add another owner',
  'admin A cannot make anyone owner'
);

-- Admin cannot change own role
select throws_ok(
  format(
    'update public.studio_member set role = %L where studio_id = %L::uuid and user_id = %L::uuid',
    'owner',
    current_setting('test.studio_a'),
    current_setting('test.admin_a')
  ),
  'Nobody can change their own role',
  'admin A cannot change their own role'
);

-- Owner can add a teacher
select test_as(current_setting('test.owner_a')::uuid);
select lives_ok(
  format(
    'insert into public.studio_member (studio_id, user_id, role) values (%L::uuid, %L::uuid, %L)',
    current_setting('test.studio_a'),
    'a0000000-0000-4000-8000-000000000097',
    'teacher'
  ),
  'owner A can add a teacher'
);

-- Removing the last owner fails
select test_reset_role();
-- Ensure studio B has only one owner for this check
select throws_ok(
  format(
    'delete from public.studio_member where studio_id = %L::uuid and user_id = %L::uuid',
    current_setting('test.studio_b'),
    current_setting('test.owner_b')
  ),
  'Cannot remove or demote the last owner',
  'removing the last owner fails'
);

-- Anon can call no helper and read no table
select test_as_anon();
select throws_ok(
  format('select app_private.is_studio_member(%L::uuid)', current_setting('test.studio_a')),
  null,
  null,
  'anon cannot execute is_studio_member'
);
select is((select count(*)::int from public.family), 0, 'anon reads no family rows');
select is((select count(*)::int from public.studio), 0, 'anon reads no studio rows');

-- studio_member as teacher A does not raise recursion
select test_as(current_setting('test.teacher_a')::uuid);
select lives_ok('select count(*) from public.studio_member', 'querying studio_member as teacher A does not recurse');

-- Helpers return expected booleans for teacher A
select is(
  app_private.is_studio_member(current_setting('test.studio_a')::uuid),
  true,
  'teacher A is_studio_member A'
);
select is(
  app_private.is_studio_member(current_setting('test.studio_b')::uuid),
  false,
  'teacher A is not member of B'
);
select is(
  app_private.has_studio_role(current_setting('test.studio_a')::uuid, array['owner','admin']),
  false,
  'teacher A lacks owner/admin on A'
);
select is(
  app_private.has_studio_role(current_setting('test.studio_a')::uuid, array['teacher']),
  true,
  'teacher A has teacher on A'
);

-- Staff can select own studio families
select is(
  (select count(*)::int from public.family where studio_id = current_setting('test.studio_a')::uuid),
  1,
  'teacher A can select own studio family'
);

-- terms_document insert: teacher refused, admin allowed
select throws_ok(
  format(
    'insert into public.terms_document (studio_id, kind) values (%L::uuid, %L)',
    current_setting('test.studio_a'),
    'studio_agreement'
  ),
  null,
  null,
  'teacher cannot insert terms_document'
);
select test_as(current_setting('test.admin_a')::uuid);
select lives_ok(
  format(
    'insert into public.terms_document (studio_id, kind) values (%L::uuid, %L)',
    current_setting('test.studio_a'),
    'studio_agreement'
  ),
  'admin can insert terms_document'
);

-- oauth_connection: authenticated cannot select token columns
select test_as(current_setting('test.owner_a')::uuid);
select throws_ok(
  'select access_token_secret_id from public.oauth_connection',
  null,
  null,
  'authenticated cannot select oauth token secret columns'
);

-- Fill remaining plan slots with role×operation smoke checks on invitation for teacher A
select test_as(current_setting('test.teacher_a')::uuid);
select lives_ok(
  format(
    'insert into public.invitation (studio_id, family_id, email, token_hash, status, expires_at, sent_at)
     values (%L::uuid, %L::uuid, %L, %L, %L, now() + interval %L, now())',
    current_setting('test.studio_a'),
    current_setting('test.family_a'),
    'invite@example.com',
    'hash-teacher-a-1',
    'sent',
    '7 days'
  ),
  'teacher A can insert invitation in studio A'
);
select throws_ok(
  format(
    'insert into public.invitation (studio_id, family_id, email, token_hash, status, expires_at, sent_at)
     values (%L::uuid, %L::uuid, %L, %L, %L, now() + interval %L, now())',
    current_setting('test.studio_b'),
    current_setting('test.family_b'),
    'inviteb@example.com',
    'hash-teacher-a-b',
    'sent',
    '7 days'
  ),
  null,
  null,
  'teacher A cannot insert invitation in studio B'
);

-- Concurrent last-owner note: covered by vitest integration when SUPABASE_LOCAL=1;
-- serialised lock path is unit-checked here with two owners then dual delete.
select test_reset_role();
insert into public.studio_member (studio_id, user_id, role)
values (current_setting('test.studio_b')::uuid, 'b0000000-0000-4000-8000-000000000099', 'owner');
-- Now B has two owners; deleting one succeeds
select lives_ok(
  format(
    'delete from public.studio_member where studio_id = %L::uuid and user_id = %L::uuid',
    current_setting('test.studio_b'),
    'b0000000-0000-4000-8000-000000000099'
  ),
  'removing one of two owners succeeds'
);
select throws_ok(
  format(
    'delete from public.studio_member where studio_id = %L::uuid and user_id = %L::uuid',
    current_setting('test.studio_b'),
    current_setting('test.owner_b')
  ),
  'Cannot remove or demote the last owner',
  'removing the remaining last owner fails'
);

-- ---------------------------------------------------------------------------
-- Platform admin (0005)
-- ---------------------------------------------------------------------------
select set_config('test.platform_admin', 'c0000000-0000-4000-8000-000000000001', true);

create or replace function test_as_aal(uid uuid, aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated', 'aal', aal)::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

-- Seed auth.users + platform_staff as postgres
select test_reset_role();
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  current_setting('test.platform_admin')::uuid,
  'authenticated',
  'authenticated',
  'platform-admin@example.com',
  crypt('not-used', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
);

insert into public.platform_staff (user_id, role, display_name, created_by)
values (current_setting('test.platform_admin')::uuid, 'platform_admin', 'Platform Admin', null);

insert into public.platform_audit (actor_user_id, event, detail)
values (current_setting('test.platform_admin')::uuid, 'bootstrap_admin', '{}'::jsonb);

-- anon cannot read platform tables
select test_as_anon();
select throws_ok(
  'select * from public.platform_staff',
  null,
  null,
  'anon cannot read platform_staff'
);
select throws_ok(
  'select * from public.platform_audit',
  null,
  null,
  'anon cannot read platform_audit'
);

-- studio owner cannot read platform tables
select test_as_aal(current_setting('test.owner_a')::uuid, 'aal2');
select is(
  (select count(*)::int from public.platform_staff),
  0,
  'studio owner gets zero platform_staff rows'
);
select is(
  (select count(*)::int from public.platform_audit),
  0,
  'studio owner gets zero platform_audit rows'
);

-- platform admin at aal1 cannot read
select test_as_aal(current_setting('test.platform_admin')::uuid, 'aal1');
select is(
  (select count(*)::int from public.platform_staff),
  0,
  'platform admin at aal1 cannot read platform_staff'
);
select is(
  (select count(*)::int from public.platform_audit),
  0,
  'platform admin at aal1 cannot read platform_audit'
);

-- platform admin at aal2 can read
select test_as_aal(current_setting('test.platform_admin')::uuid, 'aal2');
select is(
  (select count(*)::int from public.platform_staff where user_id = current_setting('test.platform_admin')::uuid),
  1,
  'platform admin at aal2 can read platform_staff'
);
select ok(
  (select count(*)::int from public.platform_audit) >= 1,
  'platform admin at aal2 can read platform_audit'
);

-- nobody can update or delete platform_audit
select test_as_aal(current_setting('test.platform_admin')::uuid, 'aal2');
select throws_ok(
  'update public.platform_audit set event = ''sign_in''',
  null,
  null,
  'authenticated cannot update platform_audit'
);
select throws_ok(
  'delete from public.platform_audit',
  null,
  null,
  'authenticated cannot delete platform_audit'
);

-- authenticated cannot execute create_studio_with_owner
select test_as_aal(current_setting('test.platform_admin')::uuid, 'aal2');
select throws_ok(
  format(
    'select public.create_studio_with_owner(%L, %L, %L::uuid, %L::uuid)',
    'Blocked Studio',
    'Australia/Melbourne',
    current_setting('test.owner_a'),
    current_setting('test.platform_admin')
  ),
  null,
  null,
  'authenticated cannot execute create_studio_with_owner'
);

-- platform admin still cannot read another studio's family / student / invoice
select test_as_aal(current_setting('test.platform_admin')::uuid, 'aal2');
select is(
  (select count(*)::int from public.family where studio_id = current_setting('test.studio_a')::uuid),
  0,
  'platform admin cannot read studio A family'
);
select is(
  (select count(*)::int from public.student where studio_id = current_setting('test.studio_a')::uuid),
  0,
  'platform admin cannot read studio A student'
);
select is(
  (select count(*)::int from public.invoice where studio_id = current_setting('test.studio_a')::uuid),
  0,
  'platform admin cannot read studio A invoice'
);

select finish();
rollback;
