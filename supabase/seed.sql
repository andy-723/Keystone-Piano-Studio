-- Demo studio: Ms Margaret Clarke / Keystone Music HQ
-- Published terms v1 hashes are seeded by the app mock (renderTerms + hashTerms) when ONBOARDING_BACKEND=mock.
-- For live Supabase, run the seed helper after migrations or insert matching sha256 from the app.

insert into studio (id, name, owner_user_id, default_language, reply_to_email, timezone)
values (
  '11111111-1111-1111-1111-111111111111',
  'Keystone Music HQ',
  null,
  'en',
  'studio@keystone.example',
  'Australia/Melbourne'
)
on conflict (id) do nothing;

insert into studio_member (studio_id, user_id, role)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'owner')
on conflict do nothing;

insert into family (id, studio_id, display_name)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Chen family')
on conflict (id) do nothing;

insert into guardian (id, family_id, full_name, email, mobile, preferred_language)
values (
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  'Wei Chen',
  'wei.chen@example.com',
  '0491 570 006',
  'zh-CN'
)
on conflict (id) do nothing;

insert into student (id, family_id, first_name, last_name, birth_year)
values
  ('55555555-5555-5555-5555-555555555551', '33333333-3333-3333-3333-333333333333', 'Lucy', 'Chen', 2015),
  ('55555555-5555-5555-5555-555555555552', '33333333-3333-3333-3333-333333333333', 'Oscar', 'Chen', 2017)
on conflict (id) do nothing;
