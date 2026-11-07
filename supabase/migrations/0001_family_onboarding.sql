-- Family onboarding (Sydney project region). All ids uuid, times timestamptz, created_at on every table.
-- RLS: studio members RW own studio; guardians read own family rows; terms_version/acceptance append-only;
-- consent_record UPDATE only for withdrawn_at; email_log insert-only; anon has no table access.

create extension if not exists "pgcrypto";

create table studio (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid,
  default_language text not null default 'en' check (default_language in ('en', 'zh-CN')),
  reply_to_email text,
  logo_url text,
  timezone text not null default 'Australia/Melbourne',
  created_at timestamptz not null default now()
);

create table studio_member (
  studio_id uuid not null references studio(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'teacher')),
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

create table family (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studio(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table guardian (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family(id) on delete cascade,
  user_id uuid,
  full_name text not null,
  email text not null,
  mobile text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'zh-CN')),
  created_at timestamptz not null default now()
);

create table student (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references family(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_year int not null,
  date_of_birth date,
  created_at timestamptz not null default now()
);

create table invitation (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studio(id) on delete cascade,
  family_id uuid not null references family(id) on delete cascade,
  email text not null,
  language text not null default 'en' check (language in ('en', 'zh-CN')),
  token_hash text not null unique,
  status text not null check (status in ('sent', 'opened', 'completed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  sent_at timestamptz not null,
  opened_at timestamptz,
  completed_at timestamptz,
  reminder_count int not null default 0,
  last_reminder_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table invitation_student (
  invitation_id uuid not null references invitation(id) on delete cascade,
  student_id uuid not null references student(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invitation_id, student_id)
);

create table intake_response (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitation(id) on delete cascade,
  student_id uuid references student(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  current_step text not null default 'collection',
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table terms_document (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studio(id) on delete cascade,
  kind text not null check (kind in ('studio_agreement', 'platform_terms', 'family_app_terms')),
  created_at timestamptz not null default now()
);

create table terms_version (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references terms_document(id) on delete cascade,
  version_no int not null,
  rendered_markdown text not null,
  merge_values jsonb not null default '{}'::jsonb,
  switches jsonb not null default '{}'::jsonb,
  sha256 text not null,
  change_type text,
  change_summary text,
  effective_at timestamptz not null,
  published_at timestamptz,
  published_by uuid,
  edited_clause_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table terms_acceptance (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references terms_version(id),
  sha256 text not null,
  user_id uuid,
  guardian_id uuid references guardian(id),
  typed_name text not null,
  document_kind text not null check (document_kind in ('studio_agreement', 'family_app_terms')),
  account_email text not null,
  capacity text not null check (capacity in ('self', 'guardian')),
  relationship text not null check (relationship in ('parent', 'legal_guardian', 'self')),
  guardian_declaration boolean not null default false,
  student_ids uuid[] not null default '{}',
  invitation_id uuid references invitation(id),
  method text not null check (method in ('invite', 'reaccept', 'offline_upload')),
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  receipt_id uuid not null,
  created_at timestamptz not null default now()
);

create table consent_record (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studio(id) on delete cascade,
  student_id uuid not null references student(id) on delete cascade,
  type text not null check (type in ('emergency_medical', 'health_notes', 'media_public', 'lesson_recordings')),
  granted boolean not null,
  wording_version text not null,
  given_by text not null,
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studio(id) on delete cascade,
  invitation_id uuid references invitation(id) on delete set null,
  kind text not null check (kind in ('invite', 'reminder', 'login_link')),
  to_email text not null,
  resend_id text,
  status text not null,
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table auth_audit (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studio(id) on delete cascade,
  actor_user_id uuid,
  guardian_id uuid,
  event text not null check (event in (
    'invite_opened', 'invite_submitted', 'invite_resent', 'magic_link_requested',
    'sign_in', 'mfa_enrolled', 'mfa_removed', 'token_rejected'
  )),
  ip text,
  user_agent text,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- RLS
alter table studio enable row level security;
alter table studio_member enable row level security;
alter table family enable row level security;
alter table guardian enable row level security;
alter table student enable row level security;
alter table invitation enable row level security;
alter table invitation_student enable row level security;
alter table intake_response enable row level security;
alter table terms_document enable row level security;
alter table terms_version enable row level security;
alter table terms_acceptance enable row level security;
alter table consent_record enable row level security;
alter table email_log enable row level security;
alter table auth_audit enable row level security;

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

-- Studio members: read/write own studio rows
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
-- No UPDATE/DELETE policies on terms_version (append-only)
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
-- No UPDATE/DELETE on terms_acceptance
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

-- Guardian own-family reads
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
