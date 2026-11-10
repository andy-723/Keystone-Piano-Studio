-- Local rehearsal only. Restores 0001 RLS behaviour and drops 0003 objects.
-- Apply against a local Supabase after 0003; do not use on production.

drop policy if exists oauth_connection_status_owner_admin on public.oauth_connection;
drop view if exists public.oauth_connection_status;
drop function if exists public.release_oauth_refresh(uuid, text);
drop function if exists public.save_oauth_tokens(uuid, text, bigint, uuid, uuid, timestamptz);
drop function if exists public.claim_oauth_refresh(uuid, text, int);
drop table if exists public.oauth_connection;

drop policy if exists studio_docs_guardian_select on storage.objects;
drop policy if exists studio_docs_staff_all on storage.objects;
drop policy if exists studio_media_guardian_insert on storage.objects;
drop policy if exists studio_media_guardian_select on storage.objects;
drop policy if exists studio_media_staff_delete on storage.objects;
drop policy if exists studio_media_staff_update on storage.objects;
drop policy if exists studio_media_staff_insert on storage.objects;
drop policy if exists studio_media_staff_select on storage.objects;
drop function if exists app_private.storage_path_studio_id(text);
delete from storage.buckets where id in ('studio-media', 'studio-docs');

drop index if exists oauth_connection_studio_id_idx;
drop index if exists auth_audit_studio_id_idx;
drop index if exists email_log_studio_id_idx;
drop index if exists consent_record_studio_id_idx;
drop index if exists terms_acceptance_studio_id_idx;
drop index if exists terms_version_studio_id_idx;
drop index if exists terms_document_studio_id_idx;
drop index if exists intake_response_studio_id_idx;
drop index if exists invitation_student_studio_id_idx;
drop index if exists invitation_studio_id_idx;
drop index if exists student_studio_id_idx;
drop index if exists guardian_studio_id_idx;
drop index if exists family_studio_id_idx;
drop index if exists guardian_user_id_idx;
drop index if exists studio_member_user_id_idx;

-- Drop 0003 policies
drop policy if exists studio_select on public.studio;
drop policy if exists studio_update on public.studio;
drop policy if exists studio_member_select on public.studio_member;
drop policy if exists studio_member_insert on public.studio_member;
drop policy if exists studio_member_update on public.studio_member;
drop policy if exists studio_member_delete on public.studio_member;
drop policy if exists family_staff_all on public.family;
drop policy if exists family_guardian_select on public.family;
drop policy if exists guardian_staff_all on public.guardian;
drop policy if exists guardian_self_select on public.guardian;
drop policy if exists student_staff_all on public.student;
drop policy if exists student_guardian_select on public.student;
drop policy if exists invitation_staff_all on public.invitation;
drop policy if exists invitation_student_staff_all on public.invitation_student;
drop policy if exists intake_staff_all on public.intake_response;
drop policy if exists intake_guardian_select on public.intake_response;
drop policy if exists terms_document_staff_select on public.terms_document;
drop policy if exists terms_document_owner_admin_insert on public.terms_document;
drop policy if exists terms_document_owner_admin_update on public.terms_document;
drop policy if exists terms_document_owner_admin_delete on public.terms_document;
drop policy if exists terms_version_staff_select on public.terms_version;
drop policy if exists terms_version_owner_admin_insert on public.terms_version;
drop policy if exists terms_acceptance_staff_select on public.terms_acceptance;
drop policy if exists terms_acceptance_staff_insert on public.terms_acceptance;
drop policy if exists acceptance_guardian_select on public.terms_acceptance;
drop policy if exists consent_staff_select on public.consent_record;
drop policy if exists consent_staff_insert on public.consent_record;
drop policy if exists consent_staff_withdraw on public.consent_record;
drop policy if exists consent_guardian_select on public.consent_record;
drop policy if exists email_log_staff_insert on public.email_log;
drop policy if exists email_log_staff_select on public.email_log;
drop policy if exists auth_audit_owner_admin_select on public.auth_audit;
drop policy if exists auth_audit_staff_insert on public.auth_audit;
drop policy if exists tenancy_helper_studio_member_select on public.studio_member;
drop policy if exists tenancy_helper_guardian_select on public.guardian;
drop policy if exists tenancy_helper_family_select on public.family;

drop trigger if exists studio_member_role_guard on public.studio_member;
drop trigger if exists guardian_studio_id_guard on public.guardian;
drop trigger if exists student_studio_id_guard on public.student;
drop trigger if exists invitation_student_studio_id_guard on public.invitation_student;
drop trigger if exists intake_response_studio_id_guard on public.intake_response;
drop trigger if exists terms_version_studio_id_guard on public.terms_version;
drop trigger if exists terms_acceptance_studio_id_guard on public.terms_acceptance;

drop function if exists app_private.enforce_studio_member_roles();
drop function if exists app_private.fill_and_check_studio_id();
drop function if exists app_private.has_studio_role(uuid, text[]);
drop function if exists app_private.is_studio_member(uuid);
drop function if exists app_private.guardian_family_ids();

alter table public.guardian drop column if exists studio_id;
alter table public.student drop column if exists studio_id;
alter table public.invitation_student drop column if exists studio_id;
alter table public.intake_response drop column if exists studio_id;
alter table public.terms_version drop column if exists studio_id;
alter table public.terms_acceptance drop column if exists studio_id;

-- Restore 0001 helper functions and policies
create or replace function public.is_studio_member(target_studio uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from studio_member m
    where m.studio_id = target_studio and m.user_id = auth.uid()
  );
$$;

create or replace function public.guardian_family_ids()
returns setof uuid language sql stable as $$
  select family_id from guardian where user_id = auth.uid();
$$;

create policy studio_member_all on studio for all using (public.is_studio_member(id)) with check (public.is_studio_member(id));
create policy studio_member_rw on studio_member for all using (public.is_studio_member(studio_id)) with check (public.is_studio_member(studio_id));
create policy family_member_rw on family for all using (public.is_studio_member(studio_id)) with check (public.is_studio_member(studio_id));
create policy guardian_member_rw on guardian for all using (
  exists (select 1 from family f where f.id = family_id and public.is_studio_member(f.studio_id))
) with check (
  exists (select 1 from family f where f.id = family_id and public.is_studio_member(f.studio_id))
);
create policy student_member_rw on student for all using (
  exists (select 1 from family f where f.id = family_id and public.is_studio_member(f.studio_id))
) with check (
  exists (select 1 from family f where f.id = family_id and public.is_studio_member(f.studio_id))
);
create policy invitation_member_rw on invitation for all using (public.is_studio_member(studio_id)) with check (public.is_studio_member(studio_id));
create policy invitation_student_member_rw on invitation_student for all using (
  exists (select 1 from invitation i where i.id = invitation_id and public.is_studio_member(i.studio_id))
) with check (
  exists (select 1 from invitation i where i.id = invitation_id and public.is_studio_member(i.studio_id))
);
create policy intake_member_rw on intake_response for all using (
  exists (select 1 from invitation i where i.id = invitation_id and public.is_studio_member(i.studio_id))
) with check (
  exists (select 1 from invitation i where i.id = invitation_id and public.is_studio_member(i.studio_id))
);
create policy terms_document_member_rw on terms_document for all using (public.is_studio_member(studio_id)) with check (public.is_studio_member(studio_id));
create policy terms_version_member_insert on terms_version for insert with check (
  exists (select 1 from terms_document d where d.id = document_id and public.is_studio_member(d.studio_id))
);
create policy terms_version_member_select on terms_version for select using (
  exists (select 1 from terms_document d where d.id = document_id and public.is_studio_member(d.studio_id))
);
create policy terms_acceptance_member_insert on terms_acceptance for insert with check (
  exists (
    select 1 from terms_version v
    join terms_document d on d.id = v.document_id
    where v.id = version_id and public.is_studio_member(d.studio_id)
  )
);
create policy terms_acceptance_member_select on terms_acceptance for select using (
  exists (
    select 1 from terms_version v
    join terms_document d on d.id = v.document_id
    where v.id = version_id and public.is_studio_member(d.studio_id)
  )
);
create policy consent_member_select on consent_record for select using (public.is_studio_member(studio_id));
create policy consent_member_insert on consent_record for insert with check (public.is_studio_member(studio_id));
create policy consent_member_withdraw on consent_record for update using (public.is_studio_member(studio_id))
  with check (withdrawn_at is not null);
create policy email_log_member_insert on email_log for insert with check (public.is_studio_member(studio_id));
create policy email_log_member_select on email_log for select using (public.is_studio_member(studio_id));
create policy auth_audit_owner_select on auth_audit for select using (
  exists (
    select 1 from studio_member m
    where m.studio_id = auth_audit.studio_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
);
create policy auth_audit_insert on auth_audit for insert with check (public.is_studio_member(studio_id));
create policy family_guardian_select on family for select using (id in (select public.guardian_family_ids()));
create policy guardian_self_select on guardian for select using (family_id in (select public.guardian_family_ids()));
create policy student_guardian_select on student for select using (family_id in (select public.guardian_family_ids()));
create policy intake_guardian_select on intake_response for select using (
  exists (
    select 1 from invitation i
    where i.id = invitation_id and i.family_id in (select public.guardian_family_ids())
  )
);
create policy acceptance_guardian_select on terms_acceptance for select using (
  guardian_id in (select g.id from guardian g where g.user_id = auth.uid())
  or exists (
    select 1 from unnest(student_ids) sid
    join student s on s.id = sid
    where s.family_id in (select public.guardian_family_ids())
  )
);
create policy consent_guardian_select on consent_record for select using (
  exists (
    select 1 from student s
    where s.id = student_id and s.family_id in (select public.guardian_family_ids())
  )
);

drop schema if exists app_private cascade;
drop role if exists tenancy_helper;
