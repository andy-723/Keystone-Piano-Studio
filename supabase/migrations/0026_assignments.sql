-- 0026 weekly practice tasks (assignments) and marking for real studios (23 Nov 2026).
-- assignment: the tasks a teacher sets at a lesson, one per lesson occurrence (occurrence_key =
--   series id + original date, the key lesson notes (0023) and attendance (0025) use), with the
--   lesson date and a due date. marked_at is set once the teacher has marked every task.
-- assignment_task: the tasks in order. A family ticks a task done through the server, which
--   logs the minutes as a practice_log row (practice_log_id). The teacher marks each task:
--   done_well, keep_going or needs_work, with an optional comment shared with the family.
--   A task linked to a course item (course_item_id, an id inside the student_course jsonb) also
--   adds a shared checkpoint to that course from the app.
-- Staff read and write both tables through RLS. Families have no table access: they read a
-- family-safe copy and tick tasks off through the server (src/server/family-assignments.ts).
-- Deleting a practice entry un-ticks the task it ticked (trigger on practice_log).
-- notify_marking_candidates is replaced (same signature) so the 7am summary also counts marked
-- tasks with no course item; tasks with one are already counted through the course feedback.
-- Expand-only: two new tables and one replaced function; the app ignores missing tables.

create table public.assignment (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  occurrence_key text check (occurrence_key is null or char_length(occurrence_key) between 1 and 120),
  lesson_date date not null,
  due_date date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  marked_at timestamptz,
  check (due_date >= lesson_date and due_date <= lesson_date + 60)
);

create unique index assignment_occurrence_key on public.assignment (studio_id, occurrence_key)
  where occurrence_key is not null;
create index assignment_student_idx on public.assignment (studio_id, student_id, lesson_date desc);

create table public.assignment_task (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  assignment_id uuid not null references public.assignment(id) on delete cascade,
  position smallint not null check (position between 0 and 19),
  text text not null check (char_length(btrim(text)) between 1 and 300),
  minutes_per_day smallint not null check (minutes_per_day between 1 and 240),
  days_per_week smallint not null check (days_per_week between 1 and 7),
  course_item_id text check (course_item_id is null or char_length(course_item_id) <= 120),
  -- A Library item copied onto the task when it was saved, so families need no Library access.
  attachment_title text check (attachment_title is null or char_length(attachment_title) between 1 and 200),
  attachment_url text check (attachment_url is null or (char_length(attachment_url) <= 2000 and attachment_url ~ '^https://')),
  done_at timestamptz,
  done_by text check (done_by is null or done_by in ('student', 'parent')),
  practice_log_id uuid references public.practice_log(id) on delete set null,
  mark text check (mark is null or mark in ('done_well', 'keep_going', 'needs_work')),
  mark_comment text check (mark_comment is null or char_length(mark_comment) between 1 and 1000),
  marked_at timestamptz,
  marked_by uuid,
  created_at timestamptz not null default now(),
  check ((mark is null) = (marked_at is null)),
  check (mark_comment is null or mark is not null),
  check ((done_at is null) = (done_by is null)),
  unique (assignment_id, position) deferrable initially deferred
);

create index assignment_task_assignment_idx on public.assignment_task (assignment_id, position);
create index assignment_task_practice_idx on public.assignment_task (practice_log_id);
create index assignment_task_marked_idx on public.assignment_task (studio_id, marked_at);

alter table public.assignment enable row level security;
alter table public.assignment_task enable row level security;
-- Supabase default privileges grant everything to authenticated: take it back, then allow staff.
revoke all on table public.assignment, public.assignment_task from anon, authenticated, public;
grant select, insert, update, delete on table public.assignment, public.assignment_task to authenticated;

-- The student must belong to the studio, a task to an assignment of the same studio, and a row
-- cannot move to another studio, student or assignment.
create or replace function app_private.check_assignment()
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
    raise exception 'An assignment cannot move to another student' using errcode = '23514';
  end if;
  if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
    raise exception 'Assignment must be for a student of this studio' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger assignment_guard before insert or update on public.assignment
  for each row execute function app_private.check_assignment();

create or replace function app_private.check_assignment_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.studio_id is distinct from old.studio_id
    or new.assignment_id is distinct from old.assignment_id
  ) then
    raise exception 'A task cannot move to another assignment' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.assignment a where a.id = new.assignment_id and a.studio_id = new.studio_id
  ) then
    raise exception 'Task must belong to an assignment of this studio' using errcode = '23514';
  end if;
  if new.practice_log_id is not null and (tg_op = 'INSERT' or new.practice_log_id is distinct from old.practice_log_id) and not exists (
    select 1 from public.practice_log p
      join public.assignment a on a.id = new.assignment_id
     where p.id = new.practice_log_id and p.studio_id = new.studio_id and p.student_id = a.student_id
  ) then
    raise exception 'Practice must be this student''s' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger assignment_task_guard before insert or update on public.assignment_task
  for each row execute function app_private.check_assignment_task();

-- Deleting a practice entry un-ticks the task it ticked. BEFORE delete, so it runs while the
-- link is still there (the foreign key then sets practice_log_id to null).
create or replace function app_private.untick_task_for_practice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assignment_task t
     set done_at = null, done_by = null
   where t.practice_log_id = old.id;
  return old;
end;
$$;

create trigger practice_log_untick_task before delete on public.practice_log
  for each row execute function app_private.untick_task_for_practice();

create policy assignment_staff_all on public.assignment
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy assignment_task_staff_all on public.assignment_task
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

do $$
declare
  t text;
begin
  foreach t in array array['assignment', 'assignment_task'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

-- Daily summary: shared course feedback (0018) plus marked tasks with no course item.
create or replace function public.notify_marking_candidates(p_since timestamptz)
returns table (
  studio_id uuid, studio_name text, timezone text, family_id uuid, student_id uuid,
  student_first_name text, feedback_count int,
  recipient_user_id uuid, recipient_email text, recipient_name text, recipient_lang text
)
language sql
stable
security definer
set search_path = ''
as $$
  with course_feedback as (
    select c.studio_id, c.student_id, count(*)::int as feedback_count
    from public.student_course c
    cross join lateral jsonb_array_elements(coalesce(c.data->'feedback', '[]'::jsonb)) as fb(entry)
    where c.updated_at > p_since
      and coalesce((fb.entry->>'shared')::boolean, false)
      and (fb.entry->>'createdAt') ~ '^\d{4}-\d{2}-\d{2}T'
      and (fb.entry->>'createdAt')::timestamptz > p_since
    group by c.studio_id, c.student_id
  ),
  task_marks as (
    select t.studio_id, a.student_id, count(*)::int as feedback_count
    from public.assignment_task t
    join public.assignment a on a.id = t.assignment_id
    where t.marked_at > p_since and t.course_item_id is null
    group by t.studio_id, a.student_id
  ),
  shared as (
    select u.studio_id, u.student_id, sum(u.feedback_count)::int as feedback_count
    from (select * from course_feedback union all select * from task_marks) u
    group by u.studio_id, u.student_id
  )
  select sh.studio_id, s.name, s.timezone, st.family_id, st.id, st.first_name, sh.feedback_count,
         gu.user_id, gu.email, gu.full_name, gu.preferred_language
  from shared sh
  join public.studio s on s.id = sh.studio_id and not s.is_demo
  join public.student st on st.id = sh.student_id and not st.is_example
  join public.guardian gu on gu.family_id = st.family_id and gu.user_id is not null
  left join public.notification_preference p on p.user_id = gu.user_id
  where coalesce(p.marking_email, true);
$$;

revoke all on function public.notify_marking_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.notify_marking_candidates(timestamptz) to service_role;

notify pgrst, 'reload schema';
