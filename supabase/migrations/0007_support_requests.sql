-- Support requests (0007). Local rehearsal only — do not apply to production until Andrew reviews.
--
-- Help centre "Still need help?" requests to Keystone support. These are Keystone Data
-- (MSA v3.2 "Keystone Data": support records), not Studio Data: Keystone holds them in its own
-- right to support the person who asked. Retention: family app terms C8 "support record period
-- after the request is closed" — the period is still to be decided, so closed_at is recorded now
-- and the deletion job comes later.
--
-- Privacy: the app attaches no student or family records. The requester writes the message;
-- the form asks them not to include child details. Only role, studio id and app path are added.
--
-- studio_id is nullable (signed-out requests have none). This table is deliberately NOT under the
-- 0006 access_gate policies: a paused studio's owner must still be able to reach support.
--
-- Writes happen only through server code with the service key (src/server/support.ts).

create table public.support_request (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^KS-[0-9A-Z]{6}$'),
  created_at timestamptz not null default now(),
  requester_user_id uuid null references auth.users(id) on delete set null,
  requester_email text not null check (char_length(requester_email) <= 254),
  requester_name text null check (char_length(requester_name) <= 80),
  role text not null check (role in ('platform_staff', 'owner', 'admin', 'teacher', 'guardian', 'public', 'demo')),
  studio_id uuid null references public.studio(id) on delete set null,
  audience text not null check (audience in ('studio', 'family')),
  category text not null check (char_length(category) <= 40),
  urgent boolean not null default false,
  subject text not null check (char_length(subject) between 1 and 120),
  message text not null check (char_length(message) between 1 and 4000),
  lang text not null default 'en' check (lang in ('en', 'zh-CN')),
  page_path text null check (char_length(page_path) <= 200),
  suggested_article_ids text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'closed')),
  email_sent_at timestamptz null,
  closed_at timestamptz null
);

create index support_request_status_created_idx on public.support_request (status, created_at desc);
create index support_request_requester_idx on public.support_request (requester_user_id);

alter table public.support_request enable row level security;

revoke all on table public.support_request from anon;
revoke all on table public.support_request from public;

-- The requester can read their own requests. Platform admins (aal2) can read all.
-- No INSERT / UPDATE / DELETE policies for authenticated: service-role server code only.
drop policy if exists support_request_select on public.support_request;
create policy support_request_select on public.support_request
  for select to authenticated
  using (
    requester_user_id = auth.uid()
    or ((auth.jwt() ->> 'aal') = 'aal2' and app_private.is_platform_admin())
  );
