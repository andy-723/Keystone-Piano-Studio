-- Studio courses (0015): each student's course and the studio's own Library templates, per studio.
--
-- A student course is saved as one document (course, sections, slots, items, milestones,
-- feedback) so the course page saves in one write. Library rows hold only templates the studio
-- made or copied; Keystone-supplied templates ship with the app and are not stored.
-- Staff (owner/admin/teacher) read and write their studio's rows. Guardians read no rows yet
-- (the family portal comes later). 0006 restrictive access gates apply. Expand only.

create table public.student_course (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  -- { course, sections, slots, items, milestones, feedback }. Teacher notes, never files.
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active course per student; archived courses keep their history.
create unique index student_course_one_active on public.student_course (student_id) where status = 'active';
create index student_course_studio_idx on public.student_course (studio_id);

create table public.library_item (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  kind text not null check (kind in ('content', 'lesson', 'course')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_item_studio_idx on public.library_item (studio_id, kind);

alter table public.student_course enable row level security;
alter table public.library_item enable row level security;
revoke all on table public.student_course, public.library_item from anon, public;
grant select, insert, update, delete on table public.student_course, public.library_item to authenticated;

-- The student must belong to the same studio, and cannot be moved to another student.
create or replace function app_private.check_course_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    raise exception 'A course cannot move to another student' using errcode = '23514';
  end if;
  if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
    raise exception 'Course student must be a student of this studio' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger student_course_student_guard before insert or update on public.student_course
  for each row execute function app_private.check_course_student();

-- touch_updated_at comes from 0006.
create trigger library_item_touch before update on public.library_item
  for each row execute function app_private.touch_updated_at();

create policy student_course_staff_all on public.student_course
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy library_item_staff_all on public.library_item
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

do $$
declare
  t text;
begin
  foreach t in array array['student_course', 'library_item'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
