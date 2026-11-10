-- Studio news (0014): news posts and manual student groups saved per studio.
--
-- Staff (owner/admin/teacher) read all of their studio's posts and groups. Authors edit and
-- archive only their own posts (the app checks the same). Smart groups (grade, weekday...) are
-- computed from the roster and not stored. Family-side reading of news (guardian RLS by
-- audience) comes with the live family portal; until then guardians read no rows here.
-- 0006 restrictive access gates apply. Expand only.

create table public.student_group (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  student_ids uuid[] not null default '{}',
  owner_user_id uuid,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.news_post (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  author_user_id uuid not null,
  author_name text not null,
  title text not null check (length(title) between 1 and 300),
  body text not null check (length(body) <= 20000),
  tag text not null default 'news' check (tag in ('news', 'event', 'concert', 'exam', 'holiday', 'reminder')),
  -- { kind: studio | my_students | groups | families, groupIds?, familyIds? }
  audience jsonb not null default '{"kind":"studio"}'::jsonb check (jsonb_typeof(audience) = 'object'),
  important boolean not null default false,
  status text not null check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz not null,
  pinned_until timestamptz,
  expires_at timestamptz,
  event_date timestamptz,
  edited_at timestamptz,
  -- File name, kind and which students a photo shows (consent check). No file bytes or links yet.
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now()
);

create index news_post_studio_idx on public.news_post (studio_id, publish_at desc);
create index student_group_studio_idx on public.student_group (studio_id);

alter table public.student_group enable row level security;
alter table public.news_post enable row level security;
revoke all on table public.student_group, public.news_post from anon, public;
grant select, insert, update, delete on table public.student_group, public.news_post to authenticated;

-- Members being added must be students of the same studio. (Ids already in the group are not
-- re-checked, so a deleted student does not block later edits.)
create or replace function app_private.check_group_students()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.student_ids) as sid
    where (tg_op = 'INSERT' or not (sid = any(old.student_ids)))
      and not exists (select 1 from public.student s where s.id = sid and s.studio_id = new.studio_id)
  ) then
    raise exception 'Group members must be students of this studio' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger student_group_members_guard before insert or update on public.student_group
  for each row execute function app_private.check_group_students();

create policy student_group_staff_all on public.student_group
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy news_post_staff_select on public.news_post
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy news_post_author_insert on public.news_post
  for insert to authenticated
  with check (
    app_private.has_studio_role(studio_id, array['owner','admin','teacher'])
    and author_user_id = app_private.current_user_id()
  );
create policy news_post_author_update on public.news_post
  for update to authenticated
  using (
    app_private.has_studio_role(studio_id, array['owner','admin','teacher'])
    and author_user_id = app_private.current_user_id()
  )
  with check (
    app_private.has_studio_role(studio_id, array['owner','admin','teacher'])
    and author_user_id = app_private.current_user_id()
  );

do $$
declare
  t text;
begin
  foreach t in array array['student_group', 'news_post'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
