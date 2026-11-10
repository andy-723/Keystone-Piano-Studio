-- Studio chat (0013): one conversation per family, messages saved per studio.
--
-- Staff (owner/admin/teacher) read and write their studio's conversations. Guardians read their
-- own family's conversation and post into it as themselves. Messages are append-only apart from
-- read_at (who has seen it). RESTRICTIVE access gates as in 0006, so a paused studio's owner can
-- still read but nobody can post.
--
-- Expand only. Number note: 0012 is left for the lesson calendar migration.

create table public.conversation (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  family_id uuid not null references public.family(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (studio_id, family_id)
);

create table public.message (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  conversation_id uuid not null references public.conversation(id) on delete cascade,
  author_user_id uuid,
  author_role text not null check (author_role in ('teacher', 'guardian', 'student')),
  author_name text not null check (length(author_name) between 1 and 200),
  kind text not null check (kind in ('text', 'voice', 'video', 'image')),
  body text not null check (length(body) <= 20000),
  -- Lesson summary, intake link, assignment card, media details. Never secrets or files.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) < 32768),
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index message_conversation_sent_idx on public.message (conversation_id, sent_at);
create index message_studio_idx on public.message (studio_id);

alter table public.conversation enable row level security;
alter table public.message enable row level security;
revoke all on table public.conversation, public.message from anon, public;
grant select, insert, update, delete on table public.conversation, public.message to authenticated;

-- studio_id must match the family / conversation it hangs off.
create or replace function app_private.check_chat_studio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_studio uuid;
begin
  if tg_table_name = 'conversation' then
    select f.studio_id into parent_studio from public.family f where f.id = new.family_id;
  else
    select c.studio_id into parent_studio from public.conversation c where c.id = new.conversation_id;
  end if;
  if parent_studio is null then
    raise exception 'Parent row not found for %', tg_table_name;
  end if;
  if new.studio_id is null then
    new.studio_id := parent_studio;
  elsif new.studio_id is distinct from parent_studio then
    raise exception 'studio_id does not match parent studio';
  end if;
  return new;
end;
$$;

create trigger conversation_studio_guard before insert or update on public.conversation
  for each row execute function app_private.check_chat_studio();
create trigger message_studio_guard before insert or update on public.message
  for each row execute function app_private.check_chat_studio();

-- Messages are a record: only read_at may change after sending.
create or replace function app_private.message_only_read_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Messages cannot be edited after sending' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger message_append_only before update on public.message
  for each row execute function app_private.message_only_read_at();

-- A new message moves its conversation to the top of the list.
create or replace function app_private.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation set last_message_at = greatest(last_message_at, new.sent_at)
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger message_touch_conversation after insert on public.message
  for each row execute function app_private.touch_conversation();

-- Staff: their studio's chat.
create policy conversation_staff_all on public.conversation
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy message_staff_select on public.message
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy message_staff_insert on public.message
  for insert to authenticated
  with check (
    app_private.has_studio_role(studio_id, array['owner','admin','teacher'])
    and author_role = 'teacher'
    and author_user_id = app_private.current_user_id()
  );
create policy message_staff_mark_read on public.message
  for update to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

-- Guardians: their own family's conversation only.
create policy conversation_guardian_select on public.conversation
  for select to authenticated
  using (family_id in (select app_private.guardian_family_ids()));
create policy conversation_guardian_insert on public.conversation
  for insert to authenticated
  with check (family_id in (select app_private.guardian_family_ids()));
create policy message_guardian_select on public.message
  for select to authenticated
  using (conversation_id in (
    select c.id from public.conversation c where c.family_id in (select app_private.guardian_family_ids())
  ));
create policy message_guardian_insert on public.message
  for insert to authenticated
  with check (
    author_role in ('guardian', 'student')
    and author_user_id = app_private.current_user_id()
    and conversation_id in (
      select c.id from public.conversation c where c.family_id in (select app_private.guardian_family_ids())
    )
  );
create policy message_guardian_mark_read on public.message
  for update to authenticated
  using (conversation_id in (
    select c.id from public.conversation c where c.family_id in (select app_private.guardian_family_ids())
  ))
  with check (conversation_id in (
    select c.id from public.conversation c where c.family_id in (select app_private.guardian_family_ids())
  ));

-- 0006 access gates: paused studio = owner read-only, nobody posts.
do $$
declare
  t text;
begin
  foreach t in array array['conversation', 'message'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
