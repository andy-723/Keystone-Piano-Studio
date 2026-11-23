-- 0025 attendance and make-up credits for real studios (23 Nov 2026).
-- lesson_attendance: one mark per lesson occurrence (occurrence_key = series id + original date,
--   the same key lesson notes use in 0023). Attended, absent (no-show), cancelled by studio,
--   family cancelled with notice, family cancelled late, and whether that mark earned a make-up
--   credit. Kept when the lesson series is deleted (series_id set null), so history survives.
-- makeup_credit: append-only ledger per student. +1 earns a credit (studio cancel, family notice,
--   goodwill), -1 books a make-up or undoes a credit, +1 'makeup_removed' gives a booked credit
--   back, 0 'extended' moves an expiry date. Rows are never updated or deleted directly (trigger);
--   deleting the student or the make-up lesson still cascades.
-- Staff read both through RLS. All writes go through the server (src/server/attendance*.ts),
-- which checks the staff role first. Families get a family-safe copy from the server only.
-- Expand-only: two new tables, nothing existing changes, and the app ignores missing tables.

create table public.lesson_attendance (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  series_id uuid references public.lesson_series(id) on delete set null,
  occurrence_key text not null check (char_length(occurrence_key) between 1 and 120),
  -- The day the lesson actually fell on (after any move).
  lesson_date date not null,
  status text not null check (status in (
    'attended', 'absent', 'cancelled_by_studio', 'cancelled_with_notice', 'cancelled_late'
  )),
  credit boolean not null default false,
  marked_by uuid,
  marked_at timestamptz not null default now(),
  unique (studio_id, occurrence_key)
);

create index lesson_attendance_date_idx on public.lesson_attendance (studio_id, lesson_date);
create index lesson_attendance_student_idx on public.lesson_attendance (student_id, lesson_date desc);

create table public.makeup_credit (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  amount smallint not null check (amount in (-1, 0, 1)),
  reason text not null check (reason in (
    'studio_cancel', 'family_notice', 'goodwill', 'makeup_booked', 'makeup_removed', 'undone', 'extended'
  )),
  -- The lesson that earned the credit (earning rows), else null.
  occurrence_key text check (occurrence_key is null or char_length(occurrence_key) <= 120),
  -- Every row except an earning row points at the credit it uses, gives back, undoes or extends.
  applies_to uuid references public.makeup_credit(id) on delete cascade,
  makeup_series_id uuid references public.lesson_series(id) on delete set null,
  expires_on date,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((reason in ('studio_cancel', 'family_notice', 'goodwill')) = (applies_to is null)),
  check (reason not in ('studio_cancel', 'family_notice', 'goodwill') or (amount = 1 and expires_on is not null)),
  check (reason not in ('makeup_booked', 'undone') or amount = -1),
  check (reason <> 'makeup_removed' or amount = 1),
  check (reason <> 'extended' or (amount = 0 and expires_on is not null))
);

create index makeup_credit_student_idx on public.makeup_credit (studio_id, student_id, created_at);
create index makeup_credit_applies_idx on public.makeup_credit (applies_to);
create index makeup_credit_series_idx on public.makeup_credit (makeup_series_id);

alter table public.lesson_attendance enable row level security;
alter table public.makeup_credit enable row level security;
-- Supabase default privileges grant everything to authenticated: take it back, then allow reads.
revoke all on table public.lesson_attendance, public.makeup_credit from anon, authenticated, public;
grant select on table public.lesson_attendance, public.makeup_credit to authenticated;

-- The student (and the series, the credit used) must belong to the same studio.
create or replace function app_private.check_lesson_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.studio_id is distinct from old.studio_id
    or new.student_id is distinct from old.student_id
    or new.occurrence_key is distinct from old.occurrence_key
  ) then
    raise exception 'A lesson mark cannot move to another lesson or student' using errcode = '23514';
  end if;
  if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
    raise exception 'Attendance must be for a student of this studio' using errcode = '23514';
  end if;
  if new.series_id is not null and not exists (
    select 1 from public.lesson_series l
     where l.id = new.series_id and l.studio_id = new.studio_id and l.student_id = new.student_id
  ) then
    raise exception 'Attendance must be for this student''s lesson' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lesson_attendance_guard before insert or update on public.lesson_attendance
  for each row execute function app_private.check_lesson_attendance();

create or replace function app_private.check_makeup_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Append-only: a direct update or delete is refused. Cascades from deleting the student, the
  -- studio or the make-up lesson run at trigger depth 2 or more, and are allowed.
  if tg_op in ('UPDATE', 'DELETE') then
    if pg_trigger_depth() <= 1 then
      raise exception 'Make-up credit history cannot be changed' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
    raise exception 'Credit must be for a student of this studio' using errcode = '23514';
  end if;
  if new.applies_to is not null and not exists (
    select 1 from public.makeup_credit c
     where c.id = new.applies_to and c.studio_id = new.studio_id and c.student_id = new.student_id
       and c.applies_to is null
  ) then
    raise exception 'Credit change must point at one of this student''s credits' using errcode = '23514';
  end if;
  if new.makeup_series_id is not null and not exists (
    select 1 from public.lesson_series l
     where l.id = new.makeup_series_id and l.studio_id = new.studio_id and l.student_id = new.student_id
  ) then
    raise exception 'Make-up lesson must be this student''s' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger makeup_credit_guard before insert or update or delete on public.makeup_credit
  for each row execute function app_private.check_makeup_credit();

create policy lesson_attendance_staff_select on public.lesson_attendance
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy makeup_credit_staff_select on public.makeup_credit
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

do $$
declare
  t text;
begin
  foreach t in array array['lesson_attendance', 'makeup_credit'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
