-- Studio workspace (0011): real, per-studio data for studio details, students and families.
--
-- Until now every live sign-in read the same in-memory demo fixtures (Clarke Piano Studio), so
-- nothing a studio entered survived a reload and every studio saw the demo families. From this
-- migration on:
--   * studio.is_demo marks the one studio that keeps showing the demo fixtures (Andrew's demo).
--     Every other studio reads and writes its own rows here, under the existing RLS policies
--     (0003 staff/guardian policies + 0006 restrictive access gates).
--   * studio.profile holds the studio details the Settings and Terms screens edit (legal name,
--     ABN, GST, address, contact, policies, billing settings, lesson prices, teacher name).
--   * New studios start empty except for one example family and student (is_example = true)
--     that the owner can delete. create_studio_with_owner adds it; studios created before this
--     migration that have no students get one too.
--
-- Expand-only: new columns have defaults, nothing is dropped or renamed. Safe to apply before
-- the app code that uses it. Lesson times and calendars are NOT here (lesson calendar thread,
-- 0010 lesson_series).

-- ---------------------------------------------------------------------------
-- a. Columns
-- ---------------------------------------------------------------------------
alter table public.studio add column if not exists is_demo boolean not null default false;
alter table public.studio add column if not exists profile jsonb not null default '{}'::jsonb;

alter table public.family add column if not exists media_consent boolean;
alter table public.family add column if not exists news_photo_consent boolean;
alter table public.family add column if not exists is_example boolean not null default false;

alter table public.student add column if not exists is_example boolean not null default false;
alter table public.student add column if not exists exam_date date;
alter table public.student add column if not exists target_term text;
alter table public.student add column if not exists grade_goal text;

-- The profile is an object, never an array or scalar, and stays small (no files in it).
alter table public.studio drop constraint if exists studio_profile_object;
alter table public.studio add constraint studio_profile_object
  check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) < 65536);

-- is_demo is set by the platform admin only (SQL editor / service role). Owners can edit their
-- studio row (0003 studio_update) but not flip it into or out of demo mode.
create or replace function app_private.guard_studio_is_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo
     and coalesce(auth.role(), '') = 'authenticated' then
    raise exception 'is_demo can only be changed by Keystone' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists studio_is_demo_guard on public.studio;
create trigger studio_is_demo_guard
  before update on public.studio
  for each row execute function app_private.guard_studio_is_demo();

-- ---------------------------------------------------------------------------
-- b. Example family + student for a new studio
-- ---------------------------------------------------------------------------
create or replace function app_private.seed_example_student(p_studio_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_family uuid;
  new_student uuid;
begin
  if exists (select 1 from public.student s where s.studio_id = p_studio_id) then
    return null;
  end if;

  insert into public.family (studio_id, display_name, is_example)
  values (p_studio_id, 'Example family', true)
  returning id into new_family;

  -- example.com never receives mail (RFC 2606). The app never sends invites to example rows.
  insert into public.guardian (family_id, studio_id, full_name, email, preferred_language)
  values (new_family, p_studio_id, 'Sam Example', 'sam.example@example.com', 'en');

  insert into public.student (family_id, studio_id, first_name, last_name, birth_year, grade_goal, is_example)
  values (new_family, p_studio_id, 'Alex', 'Example', 2016, 'Beginner', true)
  returning id into new_student;

  return new_student;
end;
$$;

revoke all on function app_private.seed_example_student(uuid) from public, anon, authenticated;
grant execute on function app_private.seed_example_student(uuid) to service_role;

-- Same signature as 0005, now also adds the example student.
create or replace function app_private.create_studio_with_owner(
  p_name text,
  p_timezone text,
  p_owner_user_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_studio_id uuid;
begin
  insert into public.studio (name, timezone, owner_user_id)
  values (p_name, p_timezone, p_owner_user_id)
  returning id into new_studio_id;

  insert into public.studio_member (studio_id, user_id, role)
  values (new_studio_id, p_owner_user_id, 'owner');

  perform app_private.seed_example_student(new_studio_id);

  insert into public.platform_audit (actor_user_id, event, target_studio_id, target_user_id, detail)
  values (
    p_actor,
    'studio_created',
    new_studio_id,
    p_owner_user_id,
    jsonb_build_object('name', p_name, 'timezone', p_timezone)
  );

  return new_studio_id;
end;
$$;

revoke all on function app_private.create_studio_with_owner(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.create_studio_with_owner(text, text, uuid, uuid) to service_role;

-- Existing non-demo studios with no students yet get the example too.
do $$
declare
  s record;
begin
  for s in
    select st.id from public.studio st
    where not st.is_demo
      and not exists (select 1 from public.student x where x.studio_id = st.id)
  loop
    perform app_private.seed_example_student(s.id);
  end loop;
end $$;

-- Hosted Supabase: make the API see the new columns straight away.
notify pgrst, 'reload schema';
