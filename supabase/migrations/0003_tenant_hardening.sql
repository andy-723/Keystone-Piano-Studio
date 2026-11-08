-- Multi-tenant hardening (0003). Local rehearsal only — do not apply to production until Andrew reviews.
--
-- Role operations (enforced by policies + studio_member trigger):
--   owner: everything below, plus transfer ownership and add or remove owners;
--   admin: invite and remove teachers and admins, edit studio settings; cannot create, demote or remove an owner, cannot change their own role;
--   teacher: read and write families, students, invitations and intake for their studio; cannot change membership or studio settings;
--   nobody can change their own role.
--
-- Child tables (each belongs to exactly one studio through its parent today):
--   guardian (via family), student (via family), invitation_student (via invitation),
--   intake_response (via invitation), terms_version (via terms_document), terms_acceptance (via terms_version).
-- A person (auth user) may be a guardian in two studios through two guardian rows; no uniqueness on user_id alone.

-- ---------------------------------------------------------------------------
-- a. Private helpers
-- ---------------------------------------------------------------------------
create schema if not exists app_private;

revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

do $$ begin
  create role tenancy_helper nologin;
exception when duplicate_object then null;
end $$;

grant select (studio_id, user_id, role) on table public.studio_member to tenancy_helper;
grant select (family_id, user_id) on table public.guardian to tenancy_helper;
grant select (id, studio_id) on table public.family to tenancy_helper;

drop policy if exists tenancy_helper_studio_member_select on public.studio_member;
create policy tenancy_helper_studio_member_select on public.studio_member
  for select to tenancy_helper using (true);

drop policy if exists tenancy_helper_guardian_select on public.guardian;
create policy tenancy_helper_guardian_select on public.guardian
  for select to tenancy_helper using (true);

drop policy if exists tenancy_helper_family_select on public.family;
create policy tenancy_helper_family_select on public.family
  for select to tenancy_helper using (true);

create or replace function app_private.is_studio_member(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_member m
    where m.studio_id = target_studio
      and m.user_id = auth.uid()
  );
$$;

alter function app_private.is_studio_member(uuid) owner to tenancy_helper;

create or replace function app_private.has_studio_role(target_studio uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_member m
    where m.studio_id = target_studio
      and m.user_id = auth.uid()
      and m.role = any (roles)
  );
$$;

alter function app_private.has_studio_role(uuid, text[]) owner to tenancy_helper;

create or replace function app_private.guardian_family_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.family_id
  from public.guardian g
  where g.user_id = auth.uid();
$$;

alter function app_private.guardian_family_ids() owner to tenancy_helper;

revoke all on function app_private.is_studio_member(uuid) from public, anon;
revoke all on function app_private.has_studio_role(uuid, text[]) from public, anon;
revoke all on function app_private.guardian_family_ids() from public, anon;
grant execute on function app_private.is_studio_member(uuid) to authenticated;
grant execute on function app_private.has_studio_role(uuid, text[]) to authenticated;
grant execute on function app_private.guardian_family_ids() to authenticated;

create or replace function public.is_studio_member(target_studio uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.is_studio_member(target_studio);
$$;

create or replace function public.guardian_family_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select family_id from app_private.guardian_family_ids();
$$;

revoke all on function public.is_studio_member(uuid) from public, anon;
revoke all on function public.guardian_family_ids() from public, anon;
grant execute on function public.is_studio_member(uuid) to authenticated;
grant execute on function public.guardian_family_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- b / c. Role operations + last-owner protection
-- ---------------------------------------------------------------------------
create or replace function app_private.enforce_studio_member_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  remaining_owners int;
begin
  -- Service-role / superuser bootstrap (auth.uid() is null); still enforce last-owner rules below when deleting owners.
  if actor is null then
    if current_user in ('postgres', 'supabase_admin', 'service_role') then
      if tg_op = 'DELETE' and old.role = 'owner' then
        perform 1 from public.studio where id = old.studio_id for update;
        select count(*) into remaining_owners
          from public.studio_member
         where studio_id = old.studio_id and role = 'owner' and user_id <> old.user_id;
        if remaining_owners < 1 then
          raise exception 'Cannot remove or demote the last owner';
        end if;
      end if;
      if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
        perform 1 from public.studio where id = old.studio_id for update;
        select count(*) into remaining_owners
          from public.studio_member
         where studio_id = old.studio_id and role = 'owner' and user_id <> old.user_id;
        if remaining_owners < 1 then
          raise exception 'Cannot remove or demote the last owner';
        end if;
      end if;
      return coalesce(new, old);
    end if;
    raise exception 'Not authenticated';
  end if;

  select m.role into actor_role
  from public.studio_member m
  where m.studio_id = coalesce(new.studio_id, old.studio_id)
    and m.user_id = actor;

  if tg_op = 'INSERT' then
    if actor_role is null or actor_role not in ('owner', 'admin') then
      raise exception 'Only owners and admins can add members';
    end if;
    if new.role = 'owner' and actor_role <> 'owner' then
      raise exception 'Only an owner can add another owner';
    end if;
    if new.user_id = actor then
      raise exception 'Nobody can change their own role';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if actor_role is null or actor_role not in ('owner', 'admin') then
      raise exception 'Only owners and admins can change membership';
    end if;
    if old.user_id = actor or new.user_id = actor then
      raise exception 'Nobody can change their own role';
    end if;
    if actor_role = 'admin' and (old.role = 'owner' or new.role = 'owner') then
      raise exception 'Admins cannot create, demote or remove an owner';
    end if;
    if old.role = 'owner' and new.role <> 'owner' then
      perform 1 from public.studio where id = old.studio_id for update;
      select count(*) into remaining_owners
      from public.studio_member
      where studio_id = old.studio_id and role = 'owner' and user_id <> old.user_id;
      if remaining_owners < 1 then
        raise exception 'Cannot remove or demote the last owner';
      end if;
    end if;
    return new;
  end if;

  -- DELETE
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins can remove members';
  end if;
  if old.user_id = actor then
    raise exception 'Nobody can change their own role';
  end if;
  if actor_role = 'admin' and old.role = 'owner' then
    raise exception 'Admins cannot create, demote or remove an owner';
  end if;
  if old.role = 'owner' then
    perform 1 from public.studio where id = old.studio_id for update;
    select count(*) into remaining_owners
      from public.studio_member
     where studio_id = old.studio_id and role = 'owner' and user_id <> old.user_id;
    if remaining_owners < 1 then
      raise exception 'Cannot remove or demote the last owner';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists studio_member_role_guard on public.studio_member;
create trigger studio_member_role_guard
  before insert or update or delete on public.studio_member
  for each row execute function app_private.enforce_studio_member_roles();

-- ---------------------------------------------------------------------------
-- d. Child tables: studio_id + fill/match trigger
-- ---------------------------------------------------------------------------
alter table public.guardian add column if not exists studio_id uuid references public.studio(id) on delete cascade;
alter table public.student add column if not exists studio_id uuid references public.studio(id) on delete cascade;
alter table public.invitation_student add column if not exists studio_id uuid references public.studio(id) on delete cascade;
alter table public.intake_response add column if not exists studio_id uuid references public.studio(id) on delete cascade;
alter table public.terms_version add column if not exists studio_id uuid references public.studio(id) on delete cascade;
alter table public.terms_acceptance add column if not exists studio_id uuid references public.studio(id) on delete cascade;

comment on column public.guardian.studio_id is 'Belongs to one studio via family; denormalised for RLS.';
comment on column public.student.studio_id is 'Belongs to one studio via family; denormalised for RLS.';
comment on column public.invitation_student.studio_id is 'Belongs to one studio via invitation; denormalised for RLS.';
comment on column public.intake_response.studio_id is 'Belongs to one studio via invitation; denormalised for RLS.';
comment on column public.terms_version.studio_id is 'Belongs to one studio via terms_document; denormalised for RLS.';
comment on column public.terms_acceptance.studio_id is 'Belongs to one studio via terms_version; denormalised for RLS.';

update public.guardian g
set studio_id = f.studio_id
from public.family f
where g.family_id = f.id and g.studio_id is null;

update public.student s
set studio_id = f.studio_id
from public.family f
where s.family_id = f.id and s.studio_id is null;

update public.invitation_student isr
set studio_id = i.studio_id
from public.invitation i
where isr.invitation_id = i.id and isr.studio_id is null;

update public.intake_response ir
set studio_id = i.studio_id
from public.invitation i
where ir.invitation_id = i.id and ir.studio_id is null;

update public.terms_version tv
set studio_id = d.studio_id
from public.terms_document d
where tv.document_id = d.id and tv.studio_id is null;

update public.terms_acceptance ta
set studio_id = tv.studio_id
from public.terms_version tv
where ta.version_id = tv.id and ta.studio_id is null;

alter table public.guardian alter column studio_id set not null;
alter table public.student alter column studio_id set not null;
alter table public.invitation_student alter column studio_id set not null;
alter table public.intake_response alter column studio_id set not null;
alter table public.terms_version alter column studio_id set not null;
alter table public.terms_acceptance alter column studio_id set not null;

create or replace function app_private.fill_and_check_studio_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_studio uuid;
begin
  if tg_table_name = 'guardian' or tg_table_name = 'student' then
    select f.studio_id into parent_studio from public.family f where f.id = new.family_id;
  elsif tg_table_name = 'invitation_student' or tg_table_name = 'intake_response' then
    select i.studio_id into parent_studio from public.invitation i where i.id = new.invitation_id;
  elsif tg_table_name = 'terms_version' then
    select d.studio_id into parent_studio from public.terms_document d where d.id = new.document_id;
  elsif tg_table_name = 'terms_acceptance' then
    select tv.studio_id into parent_studio from public.terms_version tv where tv.id = new.version_id;
  else
    raise exception 'Unsupported table for studio_id trigger: %', tg_table_name;
  end if;

  if parent_studio is null then
    raise exception 'Parent row not found for studio_id fill on %', tg_table_name;
  end if;

  if new.studio_id is null then
    new.studio_id := parent_studio;
  elsif new.studio_id is distinct from parent_studio then
    raise exception 'studio_id does not match parent studio';
  end if;

  return new;
end;
$$;

drop trigger if exists guardian_studio_id_guard on public.guardian;
create trigger guardian_studio_id_guard
  before insert or update on public.guardian
  for each row execute function app_private.fill_and_check_studio_id();

drop trigger if exists student_studio_id_guard on public.student;
create trigger student_studio_id_guard
  before insert or update on public.student
  for each row execute function app_private.fill_and_check_studio_id();

drop trigger if exists invitation_student_studio_id_guard on public.invitation_student;
create trigger invitation_student_studio_id_guard
  before insert or update on public.invitation_student
  for each row execute function app_private.fill_and_check_studio_id();

drop trigger if exists intake_response_studio_id_guard on public.intake_response;
create trigger intake_response_studio_id_guard
  before insert or update on public.intake_response
  for each row execute function app_private.fill_and_check_studio_id();

drop trigger if exists terms_version_studio_id_guard on public.terms_version;
create trigger terms_version_studio_id_guard
  before insert or update on public.terms_version
  for each row execute function app_private.fill_and_check_studio_id();

drop trigger if exists terms_acceptance_studio_id_guard on public.terms_acceptance;
create trigger terms_acceptance_studio_id_guard
  before insert or update on public.terms_acceptance
  for each row execute function app_private.fill_and_check_studio_id();

-- ---------------------------------------------------------------------------
-- e. Rewrite policies (0001 tables)
-- ---------------------------------------------------------------------------
drop policy if exists studio_member_all on public.studio;
drop policy if exists studio_member_rw on public.studio_member;
drop policy if exists family_member_rw on public.family;
drop policy if exists guardian_member_rw on public.guardian;
drop policy if exists student_member_rw on public.student;
drop policy if exists invitation_member_rw on public.invitation;
drop policy if exists invitation_student_member_rw on public.invitation_student;
drop policy if exists intake_member_rw on public.intake_response;
drop policy if exists terms_document_member_rw on public.terms_document;
drop policy if exists terms_version_member_insert on public.terms_version;
drop policy if exists terms_version_member_select on public.terms_version;
drop policy if exists terms_acceptance_member_insert on public.terms_acceptance;
drop policy if exists terms_acceptance_member_select on public.terms_acceptance;
drop policy if exists consent_member_select on public.consent_record;
drop policy if exists consent_member_insert on public.consent_record;
drop policy if exists consent_member_withdraw on public.consent_record;
drop policy if exists email_log_member_insert on public.email_log;
drop policy if exists email_log_member_select on public.email_log;
drop policy if exists auth_audit_owner_select on public.auth_audit;
drop policy if exists auth_audit_insert on public.auth_audit;
drop policy if exists family_guardian_select on public.family;
drop policy if exists guardian_self_select on public.guardian;
drop policy if exists student_guardian_select on public.student;
drop policy if exists intake_guardian_select on public.intake_response;
drop policy if exists acceptance_guardian_select on public.terms_acceptance;
drop policy if exists consent_guardian_select on public.consent_record;

-- studio: SELECT for members; UPDATE for owner/admin; no INSERT/DELETE via API
create policy studio_select on public.studio
  for select to authenticated
  using (app_private.is_studio_member(id));
create policy studio_update on public.studio
  for update to authenticated
  using (app_private.has_studio_role(id, array['owner','admin']))
  with check (app_private.has_studio_role(id, array['owner','admin']));

-- studio_member
create policy studio_member_select on public.studio_member
  for select to authenticated
  using (app_private.is_studio_member(studio_id));
create policy studio_member_insert on public.studio_member
  for insert to authenticated
  with check (app_private.has_studio_role(studio_id, array['owner','admin']));
create policy studio_member_update on public.studio_member
  for update to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin']));
create policy studio_member_delete on public.studio_member
  for delete to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']));

-- family
create policy family_staff_all on public.family
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy family_guardian_select on public.family
  for select to authenticated
  using (id in (select app_private.guardian_family_ids()));

-- guardian
create policy guardian_staff_all on public.guardian
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy guardian_self_select on public.guardian
  for select to authenticated
  using (family_id in (select app_private.guardian_family_ids()));

-- student
create policy student_staff_all on public.student
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy student_guardian_select on public.student
  for select to authenticated
  using (family_id in (select app_private.guardian_family_ids()));

-- invitation
create policy invitation_staff_all on public.invitation
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

-- invitation_student
create policy invitation_student_staff_all on public.invitation_student
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

-- intake_response
create policy intake_staff_all on public.intake_response
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy intake_guardian_select on public.intake_response
  for select to authenticated
  using (
    exists (
      select 1 from public.invitation i
      where i.id = invitation_id
        and i.family_id in (select app_private.guardian_family_ids())
    )
  );

-- terms_document: staff read; owner/admin insert/update/delete
create policy terms_document_staff_select on public.terms_document
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy terms_document_owner_admin_insert on public.terms_document
  for insert to authenticated
  with check (app_private.has_studio_role(studio_id, array['owner','admin']));
create policy terms_document_owner_admin_update on public.terms_document
  for update to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin']));
create policy terms_document_owner_admin_delete on public.terms_document
  for delete to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']));

-- terms_version: append-only; insert owner/admin; select staff
create policy terms_version_staff_select on public.terms_version
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy terms_version_owner_admin_insert on public.terms_version
  for insert to authenticated
  with check (app_private.has_studio_role(studio_id, array['owner','admin']));
-- No UPDATE/DELETE (append-only)

-- terms_acceptance: append-only
create policy terms_acceptance_staff_select on public.terms_acceptance
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy terms_acceptance_staff_insert on public.terms_acceptance
  for insert to authenticated
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy acceptance_guardian_select on public.terms_acceptance
  for select to authenticated
  using (
    guardian_id in (select g.id from public.guardian g where g.user_id = auth.uid())
    or exists (
      select 1 from unnest(student_ids) sid
      join public.student s on s.id = sid
      where s.family_id in (select app_private.guardian_family_ids())
    )
  );
-- No UPDATE/DELETE (append-only)

-- consent_record: update only sets withdrawn_at
create policy consent_staff_select on public.consent_record
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy consent_staff_insert on public.consent_record
  for insert to authenticated
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy consent_staff_withdraw on public.consent_record
  for update to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (withdrawn_at is not null);
create policy consent_guardian_select on public.consent_record
  for select to authenticated
  using (
    exists (
      select 1 from public.student s
      where s.id = student_id and s.family_id in (select app_private.guardian_family_ids())
    )
  );

-- email_log: insert-only (+ select for staff)
create policy email_log_staff_insert on public.email_log
  for insert to authenticated
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
create policy email_log_staff_select on public.email_log
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));
-- No UPDATE/DELETE

-- auth_audit
create policy auth_audit_owner_admin_select on public.auth_audit
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']));
create policy auth_audit_staff_insert on public.auth_audit
  for insert to authenticated
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

-- ---------------------------------------------------------------------------
-- f. Indexes
-- ---------------------------------------------------------------------------
create index if not exists studio_member_user_id_idx on public.studio_member (user_id);
create index if not exists guardian_user_id_idx on public.guardian (user_id);
create index if not exists family_studio_id_idx on public.family (studio_id);
create index if not exists guardian_studio_id_idx on public.guardian (studio_id);
create index if not exists student_studio_id_idx on public.student (studio_id);
create index if not exists invitation_studio_id_idx on public.invitation (studio_id);
create index if not exists invitation_student_studio_id_idx on public.invitation_student (studio_id);
create index if not exists intake_response_studio_id_idx on public.intake_response (studio_id);
create index if not exists terms_document_studio_id_idx on public.terms_document (studio_id);
create index if not exists terms_version_studio_id_idx on public.terms_version (studio_id);
create index if not exists terms_acceptance_studio_id_idx on public.terms_acceptance (studio_id);
create index if not exists consent_record_studio_id_idx on public.consent_record (studio_id);
create index if not exists email_log_studio_id_idx on public.email_log (studio_id);
create index if not exists auth_audit_studio_id_idx on public.auth_audit (studio_id);

-- ---------------------------------------------------------------------------
-- 5. Storage buckets + path policies
-- Limits aligned with src/lib/media-limits.ts (chat video 50MB; practice 200MB — buckets use the larger media ceiling).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio-media',
  'studio-media',
  false,
  209715200,
  array[
    'video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v',
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'audio/mpeg','audio/mp4','audio/webm','audio/wav','audio/ogg'
  ]::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio-docs',
  'studio-docs',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

-- Paths: {studio_id}/{kind}/{uuid}
create or replace function app_private.storage_path_studio_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

drop policy if exists studio_media_staff_select on storage.objects;
drop policy if exists studio_media_staff_insert on storage.objects;
drop policy if exists studio_media_staff_update on storage.objects;
drop policy if exists studio_media_staff_delete on storage.objects;
drop policy if exists studio_media_guardian_select on storage.objects;
drop policy if exists studio_media_guardian_insert on storage.objects;
drop policy if exists studio_docs_staff_all on storage.objects;
drop policy if exists studio_docs_guardian_select on storage.objects;

create policy studio_media_staff_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studio-media'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  );
create policy studio_media_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studio-media'
    and name ~ '^[0-9a-f-]{36}/[a-z0-9_-]+/[0-9a-f-]{36}'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  );
create policy studio_media_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'studio-media'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  )
  with check (
    bucket_id = 'studio-media'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  );
create policy studio_media_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'studio-media'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  );

-- Guardians: only their own family's folder {studio_id}/family/{family_id}/...
create policy studio_media_guardian_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studio-media'
    and split_part(name, '/', 2) = 'family'
    and nullif(split_part(name, '/', 3), '')::uuid in (select app_private.guardian_family_ids())
  );
create policy studio_media_guardian_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studio-media'
    and name ~ '^[0-9a-f-]{36}/family/[0-9a-f-]{36}/'
    and nullif(split_part(name, '/', 3), '')::uuid in (select app_private.guardian_family_ids())
  );

create policy studio_docs_staff_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'studio-docs'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  )
  with check (
    bucket_id = 'studio-docs'
    and name ~ '^[0-9a-f-]{36}/[a-z0-9_-]+/[0-9a-f-]{36}'
    and app_private.has_studio_role(app_private.storage_path_studio_id(name), array['owner','admin','teacher'])
  );
create policy studio_docs_guardian_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studio-docs'
    and split_part(name, '/', 2) = 'family'
    and nullif(split_part(name, '/', 3), '')::uuid in (select app_private.guardian_family_ids())
  );

-- ---------------------------------------------------------------------------
-- 6. Xero / OAuth connection scaffold (no live Xero)
-- ---------------------------------------------------------------------------
create table if not exists public.oauth_connection (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  provider text not null,
  external_org_id text not null,
  display_name text,
  token_version bigint not null default 0,
  access_token_secret_id uuid,
  refresh_token_secret_id uuid,
  access_expires_at timestamptz,
  refresh_lease_until timestamptz,
  refresh_lease_owner text,
  status text not null check (status in ('connected', 'needs_reconnect', 'disconnected')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (studio_id, provider, external_org_id)
);

alter table public.oauth_connection enable row level security;
-- Authenticated may only see status columns (never token secret ids); use the view in app code.
revoke all on table public.oauth_connection from anon, authenticated;
grant select (id, studio_id, provider, display_name, status, last_synced_at) on table public.oauth_connection to authenticated;

create or replace view public.oauth_connection_status
with (security_invoker = true)
as
select id, studio_id, provider, display_name, status, last_synced_at
from public.oauth_connection;

grant select on public.oauth_connection_status to authenticated;

drop policy if exists oauth_connection_status_owner_admin on public.oauth_connection;
create policy oauth_connection_status_owner_admin on public.oauth_connection
  for select to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin']));

create or replace function public.claim_oauth_refresh(connection_id uuid, owner text, lease_seconds int)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_version bigint;
begin
  update public.oauth_connection c
  set refresh_lease_owner = owner,
      refresh_lease_until = now() + make_interval(secs => lease_seconds)
  where c.id = connection_id
    and c.status = 'connected'
    and (c.refresh_lease_until is null or c.refresh_lease_until < now() or c.refresh_lease_owner = owner)
  returning c.token_version into claimed_version;
  return claimed_version;
end;
$$;

create or replace function public.save_oauth_tokens(
  connection_id uuid,
  owner text,
  expected_version bigint,
  new_access_secret_id uuid,
  new_refresh_secret_id uuid,
  new_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.oauth_connection c
  set access_token_secret_id = new_access_secret_id,
      refresh_token_secret_id = new_refresh_secret_id,
      access_expires_at = new_expires_at,
      token_version = c.token_version + 1,
      refresh_lease_owner = null,
      refresh_lease_until = null
  where c.id = connection_id
    and c.token_version = expected_version
    and c.refresh_lease_owner = owner
    and c.refresh_lease_until is not null
    and c.refresh_lease_until >= now();
  return found;
end;
$$;

create or replace function public.release_oauth_refresh(connection_id uuid, owner text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.oauth_connection c
  set refresh_lease_owner = null,
      refresh_lease_until = null
  where c.id = connection_id
    and c.refresh_lease_owner = owner;
end;
$$;

revoke all on function public.claim_oauth_refresh(uuid, text, int) from public, anon, authenticated;
revoke all on function public.save_oauth_tokens(uuid, text, bigint, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.release_oauth_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_oauth_refresh(uuid, text, int) to service_role;
grant execute on function public.save_oauth_tokens(uuid, text, bigint, uuid, uuid, timestamptz) to service_role;
grant execute on function public.release_oauth_refresh(uuid, text) to service_role;

create index if not exists oauth_connection_studio_id_idx on public.oauth_connection (studio_id);
