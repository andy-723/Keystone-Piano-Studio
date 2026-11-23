-- 0024 enrolment wizard progress for real studios (Gap 2, 23 Nov 2026).
-- enrolment_progress: one row per student holding where the teacher is in Students > Enrol
--   (step 1-4, status) and their wizard answers (welcome lesson checks or ratings, starting
--   stages, course template, grade hours, lesson minutes, target term, practice goal,
--   strengths, what we'll work on) as jsonb. Saved on Continue, Back and Finish later, read
--   back at sign-in so Resume opens where the teacher left off. Kept after activation as the
--   record of the welcome lesson (status 'active', completed_at set).
-- Staff only through RLS. Families never read it; they get the welcome summary in chat.
-- Expand-only: one new table, nothing existing changes, and the app ignores a missing table.

create table public.enrolment_progress (
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  step smallint not null default 1 check (step between 1 and 4),
  status text not null default 'intake_done'
    check (status in ('intake_sent', 'intake_done', 'welcome_done', 'active')),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 32768),
  completed_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (studio_id, student_id)
);

create index enrolment_progress_student_idx on public.enrolment_progress (student_id);

alter table public.enrolment_progress enable row level security;
-- Supabase default privileges grant everything to authenticated, so revoke from it too: no delete.
revoke all on table public.enrolment_progress from anon, authenticated, public;
grant select, insert, update on table public.enrolment_progress to authenticated;

-- The student must belong to the same studio, a row cannot move to another student or studio,
-- and the saver and time are stamped by the database, not the browser.
create or replace function app_private.check_enrolment_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.studio_id is distinct from old.studio_id
    or new.student_id is distinct from old.student_id
  ) then
    raise exception 'Enrolment progress cannot move to another student' using errcode = '23514';
  end if;
  if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
    raise exception 'Enrolment progress must be for a student of this studio' using errcode = '23514';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger enrolment_progress_guard before insert or update on public.enrolment_progress
  for each row execute function app_private.check_enrolment_progress();

create policy enrolment_progress_staff_all on public.enrolment_progress
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy access_gate_select on public.enrolment_progress as restrictive for select to authenticated
  using (app_private.studio_can_read(studio_id));
create policy access_gate_insert on public.enrolment_progress as restrictive for insert to authenticated
  with check (app_private.studio_can_write(studio_id));
create policy access_gate_update on public.enrolment_progress as restrictive for update to authenticated
  using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id));

notify pgrst, 'reload schema';
