-- Lesson calendar + Google Calendar push (0010). Expand-only.
--
-- lesson_series     one student's lesson slot: weekly (repeat = 'weekly') or a single lesson
--                   (repeat = 'once', until_date = first_date). Local date + time in the studio's
--                   timezone (studio.timezone), never UTC, so lessons stay at 4 pm across DST.
-- lesson_exception  one week of a series that is cancelled or moved. One row per (series, date).
--                   "Change from this week on" ends the old series and starts a new one.
-- calendar_connection  a staff member's Google Calendar link for one studio. The refresh token
--                   lives in Supabase Vault; this table only holds the Vault secret id.
--
-- Sync is one-way (Keystone -> Google). Google event ids are derived from our uuids, so pushes are
-- idempotent and nothing about Google is needed to rebuild a calendar.
--
-- RLS: owner/admin/teacher of the studio read and write lessons; guardians read their own
-- students' lessons (for the family portal later). calendar_connection is readable by its own
-- user and by studio owner/admin; writes go through service-role server code only.
-- All three tables are under the 0006 access_gate policies.

create table public.lesson_series (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  student_id uuid not null references public.student(id) on delete cascade,
  teacher_user_id uuid not null references auth.users(id) on delete restrict,
  repeat text not null check (repeat in ('weekly', 'once')),
  first_date date not null,
  until_date date null,
  start_time time not null,
  duration_min int not null check (duration_min between 10 and 240),
  location text null check (char_length(location) <= 120),
  note text null check (char_length(note) <= 500),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Google push state for this series (one-way).
  google_sync_status text not null default 'off'
    check (google_sync_status in ('off', 'pending', 'synced', 'error')),
  google_synced_at timestamptz null,
  google_sync_error text null check (char_length(google_sync_error) <= 300),
  check (until_date is null or until_date >= first_date),
  check (repeat = 'weekly' or until_date = first_date),
  -- A lesson must finish by midnight on the same day.
  check (start_time + make_interval(mins => duration_min) <= time '23:59:59'
         and start_time + make_interval(mins => duration_min) > start_time)
);

create index lesson_series_studio_dates_idx on public.lesson_series (studio_id, first_date, until_date);
create index lesson_series_student_idx on public.lesson_series (student_id);
create index lesson_series_teacher_idx on public.lesson_series (teacher_user_id);

create table public.lesson_exception (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  series_id uuid not null references public.lesson_series(id) on delete cascade,
  original_date date not null,
  action text not null check (action in ('cancel', 'move')),
  new_date date null,
  new_start_time time null,
  note text null check (char_length(note) <= 500),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (series_id, original_date),
  check ((action = 'move') = (new_date is not null and new_start_time is not null))
);

create index lesson_exception_studio_dates_idx on public.lesson_exception (studio_id, original_date);
create index lesson_exception_studio_new_date_idx on public.lesson_exception (studio_id, new_date);

-- The student and the exception must belong to the series' studio (no cross-studio rows, even
-- through service-role code).
create or replace function app_private.lesson_same_studio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'lesson_series' then
    if not exists (select 1 from public.student s where s.id = new.student_id and s.studio_id = new.studio_id) then
      raise exception 'Student is not in this studio' using errcode = '23514';
    end if;
  else
    if not exists (select 1 from public.lesson_series l where l.id = new.series_id and l.studio_id = new.studio_id) then
      raise exception 'Lesson is not in this studio' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger lesson_series_same_studio
  before insert or update of studio_id, student_id on public.lesson_series
  for each row execute function app_private.lesson_same_studio();

create trigger lesson_exception_same_studio
  before insert or update of studio_id, series_id on public.lesson_exception
  for each row execute function app_private.lesson_same_studio();

create table public.calendar_connection (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  account_email text null check (char_length(account_email) <= 254),
  calendar_id text null check (char_length(calendar_id) <= 300),
  refresh_token_secret_id uuid null,
  status text not null check (status in ('connected', 'needs_reconnect', 'disconnected')),
  last_synced_at timestamptz null,
  last_error text null check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, user_id, provider)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lesson_series enable row level security;
alter table public.lesson_exception enable row level security;
alter table public.calendar_connection enable row level security;

revoke all on table public.lesson_series from anon, authenticated, public;
revoke all on table public.lesson_exception from anon, authenticated, public;
revoke all on table public.calendar_connection from anon, authenticated, public;

grant select, insert, update, delete on table public.lesson_series to authenticated;
grant select, insert, update, delete on table public.lesson_exception to authenticated;
-- Never expose the Vault secret id to the browser.
grant select (id, studio_id, user_id, provider, account_email, status, last_synced_at, last_error, created_at)
  on table public.calendar_connection to authenticated;

create policy lesson_series_staff_all on public.lesson_series
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy lesson_series_guardian_select on public.lesson_series
  for select to authenticated
  using (student_id in (
    select s.id from public.student s where s.family_id in (select app_private.guardian_family_ids())
  ));

create policy lesson_exception_staff_all on public.lesson_exception
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy lesson_exception_guardian_select on public.lesson_exception
  for select to authenticated
  using (series_id in (
    select l.id from public.lesson_series l
    join public.student s on s.id = l.student_id
    where s.family_id in (select app_private.guardian_family_ids())
  ));

create policy calendar_connection_select on public.calendar_connection
  for select to authenticated
  using (user_id = auth.uid() or app_private.has_studio_role(studio_id, array['owner','admin']));

-- 0006 subscription gate on the new studio tables (same shape as 0006's loop).
do $$
declare
  t text;
begin
  foreach t in array array['lesson_series', 'lesson_exception', 'calendar_connection'] loop
    execute format('drop policy if exists access_gate_select on public.%I', t);
    execute format('drop policy if exists access_gate_insert on public.%I', t);
    execute format('drop policy if exists access_gate_update on public.%I', t);
    execute format('drop policy if exists access_gate_delete on public.%I', t);
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Vault helpers for the Google refresh token. service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.calendar_connection_save(
  p_studio_id uuid,
  p_user_id uuid,
  p_account_email text,
  p_calendar_id text,
  p_refresh_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.calendar_connection;
  secret uuid;
  result uuid;
begin
  select * into existing from public.calendar_connection
   where studio_id = p_studio_id and user_id = p_user_id and provider = 'google';

  if existing.refresh_token_secret_id is not null then
    perform vault.update_secret(existing.refresh_token_secret_id, p_refresh_token);
    secret := existing.refresh_token_secret_id;
  else
    secret := vault.create_secret(p_refresh_token, 'google_calendar_' || gen_random_uuid()::text,
                                  'Keystone Google Calendar refresh token');
  end if;

  insert into public.calendar_connection
    (studio_id, user_id, provider, account_email, calendar_id, refresh_token_secret_id, status, last_error, updated_at)
  values
    (p_studio_id, p_user_id, 'google', p_account_email, p_calendar_id, secret, 'connected', null, now())
  on conflict (studio_id, user_id, provider) do update
    set account_email = excluded.account_email,
        calendar_id = coalesce(excluded.calendar_id, public.calendar_connection.calendar_id),
        refresh_token_secret_id = excluded.refresh_token_secret_id,
        status = 'connected',
        last_error = null,
        updated_at = now()
  returning id into result;
  return result;
end;
$$;

create or replace function public.calendar_connection_refresh_token(p_connection_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.calendar_connection c
  join vault.decrypted_secrets d on d.id = c.refresh_token_secret_id
  where c.id = p_connection_id and c.status = 'connected';
$$;

create or replace function public.calendar_connection_forget(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret uuid;
begin
  select refresh_token_secret_id into secret from public.calendar_connection where id = p_connection_id;
  update public.calendar_connection
     set status = 'disconnected', refresh_token_secret_id = null, updated_at = now()
   where id = p_connection_id;
  if secret is not null then
    delete from vault.secrets where id = secret;
  end if;
end;
$$;

revoke all on function public.calendar_connection_save(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.calendar_connection_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.calendar_connection_forget(uuid) from public, anon, authenticated;
grant execute on function public.calendar_connection_save(uuid, uuid, text, text, text) to service_role;
grant execute on function public.calendar_connection_refresh_token(uuid) to service_role;
grant execute on function public.calendar_connection_forget(uuid) to service_role;
