-- pgTAP studio subscription access tests (0006). Run with: supabase test db
-- One studio, owner + teacher + guardian; the subscription status is switched between checks.

begin;
select no_plan();

create extension if not exists pgtap with schema extensions;

select set_config('test.studio', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);
select set_config('test.studio_pro', 'dddddddd-dddd-dddd-dddd-dddddddddddd', true);
select set_config('test.owner', 'c0000000-0000-4000-8000-000000000001', true);
select set_config('test.teacher', 'c0000000-0000-4000-8000-000000000003', true);
select set_config('test.guardian', 'c0000000-0000-4000-8000-000000000004', true);
select set_config('test.family', 'cc111111-1111-4111-8111-111111111111', true);

insert into public.studio (id, name) values
  (current_setting('test.studio')::uuid, 'Studio C'),
  (current_setting('test.studio_pro')::uuid, 'Studio D');

insert into public.studio_member (studio_id, user_id, role) values
  (current_setting('test.studio')::uuid, current_setting('test.owner')::uuid, 'owner'),
  (current_setting('test.studio')::uuid, current_setting('test.teacher')::uuid, 'teacher');

insert into public.family (id, studio_id, display_name) values
  (current_setting('test.family')::uuid, current_setting('test.studio')::uuid, 'Family C');

insert into public.guardian (family_id, studio_id, user_id, full_name, email) values
  (current_setting('test.family')::uuid, current_setting('test.studio')::uuid,
   current_setting('test.guardian')::uuid, 'Guardian C', 'c@example.com');

create or replace function test_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;

create or replace function test_reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function test_set_status(new_status text, ends interval default null) returns void
language plpgsql as $$
begin
  update public.studio_subscription
     set status = new_status,
         access_ends_at = case when ends is null then null else now() + ends end
   where studio_id = current_setting('test.studio')::uuid;
end;
$$;

-- New studios get a subscription row with no paid plan yet
select is(
  (select status from public.studio_subscription where studio_id = current_setting('test.studio')::uuid),
  'incomplete',
  'a new studio starts incomplete'
);
select is(
  (select plan from public.studio_subscription where studio_id = current_setting('test.studio')::uuid),
  'base',
  'a new studio starts on Base'
);

-- Incomplete: owner read-only, teacher and guardian see nothing
select test_as(current_setting('test.teacher')::uuid);
select is((select count(*)::int from public.family), 0, 'incomplete: teacher sees no families');
select test_as(current_setting('test.owner')::uuid);
select is((select count(*)::int from public.family), 1, 'incomplete: owner can read families');
select test_reset_role();

-- Active: everyone works as before
select test_set_status('active');
select test_as(current_setting('test.teacher')::uuid);
select is((select count(*)::int from public.family), 1, 'active: teacher reads families');
select lives_ok(
  format('insert into public.family (studio_id, display_name) values (%L::uuid, %L)',
    current_setting('test.studio'), 'Active family'),
  'active: teacher can add a family'
);
select test_as(current_setting('test.guardian')::uuid);
select is((select count(*)::int from public.family), 1, 'active: guardian reads own family');
select test_reset_role();

-- Past due (payment failed, inside the 14 days): full access continues (MSA 5.3)
select test_set_status('past_due');
select test_as(current_setting('test.teacher')::uuid);
select is((select count(*)::int from public.family), 2, 'past_due: teacher still reads families');
select lives_ok(
  format('insert into public.family (studio_id, display_name) values (%L::uuid, %L)',
    current_setting('test.studio'), 'Past due family'),
  'past_due: teacher can still add a family'
);
select test_reset_role();

-- Suspended (MSA 12.2): owner read-only for export; teacher and guardian locked out
select test_set_status('suspended');
select test_as(current_setting('test.teacher')::uuid);
select is((select count(*)::int from public.family), 0, 'suspended: teacher sees no families');
select is((select count(*)::int from public.studio), 0, 'suspended: teacher cannot read the studio row');
select test_as(current_setting('test.guardian')::uuid);
select is((select count(*)::int from public.family), 0, 'suspended: guardian sees no family');
select is((select count(*)::int from public.guardian), 0, 'suspended: guardian sees no guardian rows');
select test_as(current_setting('test.owner')::uuid);
select is((select count(*)::int from public.family), 3, 'suspended: owner can still read every family');
select throws_ok(
  format('insert into public.family (studio_id, display_name) values (%L::uuid, %L)',
    current_setting('test.studio'), 'Suspended family'),
  '42501',
  null,
  'suspended: owner cannot add a family'
);
update public.studio set name = 'Renamed' where id = current_setting('test.studio')::uuid;
delete from public.family where studio_id = current_setting('test.studio')::uuid;
select throws_ok(
  format('insert into storage.objects (bucket_id, name) values (%L, %L)',
    'studio-docs', current_setting('test.studio') || '/docs/' || gen_random_uuid()::text),
  '42501',
  null,
  'suspended: owner cannot upload studio files'
);
select test_reset_role();
select is(
  (select name from public.studio where id = current_setting('test.studio')::uuid),
  'Studio C',
  'suspended: owner could not edit studio settings'
);
select is(
  (select count(*)::int from public.family where studio_id = current_setting('test.studio')::uuid),
  3,
  'suspended: owner could not delete families'
);

-- Nobody can change the subscription through the API
select test_set_status('active');
select test_as(current_setting('test.owner')::uuid);
select is(
  (select status from public.studio_subscription where studio_id = current_setting('test.studio')::uuid),
  'active',
  'owner can read their own subscription'
);
select throws_ok(
  format('update public.studio_subscription set status = %L where studio_id = %L::uuid',
    'comp', current_setting('test.studio')),
  '42501',
  null,
  'owner cannot change their own subscription'
);
select test_as(current_setting('test.teacher')::uuid);
select is(
  (select count(*)::int from public.studio_subscription),
  0,
  'teacher cannot read the subscription row'
);
select test_reset_role();

-- Pilot: full until its end date, then owner read-only
select test_set_status('pilot', interval '30 days');
select test_as(current_setting('test.teacher')::uuid);
select is((select count(*)::int from public.family), 3, 'pilot before end date: teacher reads families');
select test_reset_role();
select test_set_status('pilot', interval '-1 day');
select test_as(current_setting('test.teacher')::uuid);
select is((select count(*)::int from public.family), 0, 'pilot after end date: teacher locked out');
select test_as(current_setting('test.owner')::uuid);
select is((select count(*)::int from public.family), 3, 'pilot after end date: owner read-only');
select test_reset_role();

-- Canceled: owner can export for 30 days after the end (MSA 12.5), then nothing
select test_set_status('canceled', interval '-10 days');
select test_as(current_setting('test.owner')::uuid);
select is((select count(*)::int from public.family), 3, 'canceled 10 days ago: owner can still export');
select test_as(current_setting('test.teacher')::uuid);
select is((select count(*)::int from public.family), 0, 'canceled: teacher locked out');
select test_reset_role();
select test_set_status('canceled', interval '-31 days');
select test_as(current_setting('test.owner')::uuid);
select is((select count(*)::int from public.family), 0, 'canceled 31 days ago: owner has no access');
select test_reset_role();

-- Base plan: 35 students, the 36th is refused; Pro has no cap
select test_set_status('active');
insert into public.student (family_id, studio_id, first_name, last_name, birth_year)
select current_setting('test.family')::uuid, current_setting('test.studio')::uuid, 'S', n::text, 2015
from generate_series(1, 35) n;
select throws_ok(
  format('insert into public.student (family_id, studio_id, first_name, last_name, birth_year) values (%L::uuid, %L::uuid, %L, %L, 2015)',
    current_setting('test.family'), current_setting('test.studio'), 'S', '36'),
  'P0001',
  null,
  'Base: the 36th student is refused'
);
update public.studio_subscription set plan = 'pro' where studio_id = current_setting('test.studio')::uuid;
select lives_ok(
  format('insert into public.student (family_id, studio_id, first_name, last_name, birth_year) values (%L::uuid, %L::uuid, %L, %L, 2015)',
    current_setting('test.family'), current_setting('test.studio'), 'S', '36'),
  'Pro: the 36th student is allowed'
);
update public.studio_subscription set plan = 'base' where studio_id = current_setting('test.studio')::uuid;
select is(
  (select count(*)::int from public.student where studio_id = current_setting('test.studio')::uuid),
  36,
  'downgrading to Base keeps every student'
);

select finish();
rollback;
