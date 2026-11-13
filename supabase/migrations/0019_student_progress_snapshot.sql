-- 0019 student progress snapshots (Keystone Grade Benchmark, ADR-061).
-- One row per student per week (week_start = Monday, studio's local date), written by the app
-- each time a teacher saves a course or signs off an item. Weeks with no row mean no sign-offs,
-- which is what the phase 2 (Pro) stagnation alert reads. Staff only; families never read it.
-- Expand-only: no existing table changes, and the app ignores a missing table.

create table public.student_progress_snapshot (
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  course_id uuid,
  level text check (level is null or char_length(level) <= 80),
  target_term text check (target_term is null or target_term ~ '^\d{4}-T[1-4]$'),
  readiness_pct smallint not null check (readiness_pct between 0 and 100),
  -- [{ "name": "Technical work", "pct": 75, "done": 3, "total": 4 }]
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array' and pg_column_size(sections) < 8192),
  last_signoff_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, week_start)
);

create index student_progress_snapshot_studio_idx on public.student_progress_snapshot (studio_id, week_start);

alter table public.student_progress_snapshot enable row level security;
revoke all on table public.student_progress_snapshot from anon, public;
grant select, insert, update, delete on table public.student_progress_snapshot to authenticated;

-- The student must belong to the same studio, and a row cannot move to another student.
create or replace function app_private.check_progress_snapshot_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.student_id is distinct from old.student_id or new.studio_id is distinct from old.studio_id) then
    raise exception 'A progress snapshot cannot move to another student' using errcode = '23514';
  end if;
  if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
    raise exception 'Snapshot student must be a student of this studio' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger student_progress_snapshot_student_guard before insert or update on public.student_progress_snapshot
  for each row execute function app_private.check_progress_snapshot_student();

create policy student_progress_snapshot_staff_all on public.student_progress_snapshot
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy access_gate_select on public.student_progress_snapshot as restrictive for select to authenticated using (app_private.studio_can_read(studio_id));
create policy access_gate_insert on public.student_progress_snapshot as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id));
create policy access_gate_update on public.student_progress_snapshot as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id));
create policy access_gate_delete on public.student_progress_snapshot as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id));

notify pgrst, 'reload schema';
