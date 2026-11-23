-- 0023 practice logs and client notes for real studios (family portal PR B, 23 Nov 2026).
-- practice_log: minutes practised per student per day, logged by the student, a parent or the
--   teacher. Staff read and write through RLS. Families add and read their own children's logs
--   only through the server (src/server/family-portal.ts), never with a direct table grant.
-- client_note: the teacher's notes about a student or a family (lesson notes included). Staff
--   only through RLS. Families get notes marked shared through the server; private notes never
--   leave the database for them.
-- Expand-only: two new tables, nothing existing changes, and the app ignores a missing table.

create table public.practice_log (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  practice_date date not null,
  minutes smallint not null check (minutes between 1 and 600),
  logged_by text not null check (logged_by in ('student', 'parent', 'teacher')),
  logged_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index practice_log_student_idx on public.practice_log (student_id, practice_date desc);
create index practice_log_studio_idx on public.practice_log (studio_id, practice_date desc);

create table public.client_note (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  subject_type text not null check (subject_type in ('student', 'family')),
  subject_id uuid not null,
  body text not null check (char_length(body) between 1 and 5000),
  category text not null default 'general' check (category in ('lesson', 'general', 'billing', 'pastoral')),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  pinned boolean not null default false,
  -- Lesson notes: the calendar occurrence key (series id + date) the note was written in.
  lesson_occurrence_id text check (lesson_occurrence_id is null or char_length(lesson_occurrence_id) <= 120),
  author_user_id uuid,
  author_name text not null check (char_length(author_name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_note_subject_idx on public.client_note (studio_id, subject_type, subject_id, created_at desc);

alter table public.practice_log enable row level security;
alter table public.client_note enable row level security;
revoke all on table public.practice_log, public.client_note from anon, public;
grant select, insert, delete on table public.practice_log to authenticated;
grant select, insert, update, delete on table public.client_note to authenticated;

-- The student (or family) must belong to the same studio, and a row cannot move to another one.
create or replace function app_private.check_practice_log_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
    raise exception 'Practice must be logged for a student of this studio' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger practice_log_student_guard before insert on public.practice_log
  for each row execute function app_private.check_practice_log_student();

create or replace function app_private.check_client_note_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.studio_id is distinct from old.studio_id
    or new.subject_type is distinct from old.subject_type
    or new.subject_id is distinct from old.subject_id
  ) then
    raise exception 'A note cannot move to another student or family' using errcode = '23514';
  end if;
  if new.subject_type = 'student' and not exists (
    select 1 from public.student s where s.id = new.subject_id and s.studio_id = new.studio_id
  ) then
    raise exception 'Note must be about a student of this studio' using errcode = '23514';
  end if;
  if new.subject_type = 'family' and not exists (
    select 1 from public.family f where f.id = new.subject_id and f.studio_id = new.studio_id
  ) then
    raise exception 'Note must be about a family of this studio' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger client_note_subject_guard before insert or update on public.client_note
  for each row execute function app_private.check_client_note_subject();

-- client_note.subject_id points at a student or a family, so it can't carry a foreign key.
-- Deleting the student or family deletes the notes about them (privacy: nothing left behind).
create or replace function app_private.delete_client_notes_for_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.client_note n
   where n.studio_id = old.studio_id
     and n.subject_type = tg_argv[0]
     and n.subject_id = old.id;
  return old;
end;
$$;

create trigger student_client_notes_cleanup after delete on public.student
  for each row execute function app_private.delete_client_notes_for_subject('student');
create trigger family_client_notes_cleanup after delete on public.family
  for each row execute function app_private.delete_client_notes_for_subject('family');

create policy practice_log_staff_all on public.practice_log
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy client_note_staff_all on public.client_note
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

do $$
declare
  t text;
begin
  foreach t in array array['practice_log', 'client_note'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
