-- 0027 term renewals for real studios (23 Nov 2026).
-- renewal_campaign: one per studio and term (term_key like '2027-T1'), with the term dates the
--   studio used and the reply-by date. Created when the teacher sends renewal invitations.
-- renewal_response: one per family in a campaign. status awaiting / confirmed / change_requested
--   / declined, when the invitation and the last reminder went out, the answer, who answered
--   (family or staff, e.g. after a phone call) and the family's note.
-- Bill next term (Pro) bills only confirmed families when the term has a campaign. Invoices use
-- the 0004 tables (invoice.term_key, billing_period_start/end); nothing else changes.
-- Staff read and write both tables through RLS. Families have no table access: they read their
-- own invitation and answer through the server (src/server/family-renewals.ts).
-- Expand-only: two new tables; the app ignores missing tables.

create table public.renewal_campaign (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  term_key text not null check (term_key ~ '^\d{4}-T[1-4]$'),
  term_start date not null,
  term_end date not null,
  deadline date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (term_end >= term_start),
  check (deadline <= term_end),
  unique (studio_id, term_key)
);

create table public.renewal_response (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studio(id) on delete cascade,
  campaign_id uuid not null references public.renewal_campaign(id) on delete cascade,
  family_id uuid not null references public.family(id) on delete cascade,
  status text not null default 'awaiting'
    check (status in ('awaiting', 'confirmed', 'change_requested', 'declined')),
  invited_at timestamptz not null default now(),
  reminded_at timestamptz,
  responded_at timestamptz,
  responded_by text check (responded_by is null or responded_by in ('family', 'staff')),
  responded_by_user uuid,
  note text check (note is null or char_length(note) <= 1000),
  updated_at timestamptz not null default now(),
  check ((status = 'awaiting') = (responded_at is null)),
  check ((responded_at is null) = (responded_by is null)),
  unique (campaign_id, family_id)
);

create index renewal_response_family_idx on public.renewal_response (studio_id, family_id);

alter table public.renewal_campaign enable row level security;
alter table public.renewal_response enable row level security;
-- Supabase default privileges grant everything to authenticated: take it back, then allow staff.
revoke all on table public.renewal_campaign, public.renewal_response from anon, authenticated, public;
grant select, insert, update, delete on table public.renewal_campaign, public.renewal_response to authenticated;

-- A response must be for a family of the campaign's studio, and cannot move.
create or replace function app_private.check_renewal_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.studio_id is distinct from old.studio_id
    or new.campaign_id is distinct from old.campaign_id
    or new.family_id is distinct from old.family_id
  ) then
    raise exception 'A renewal answer cannot move to another family or term' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.renewal_campaign c where c.id = new.campaign_id and c.studio_id = new.studio_id
  ) then
    raise exception 'Renewal must belong to a campaign of this studio' using errcode = '23514';
  end if;
  if not exists (select 1 from public.family f where f.id = new.family_id and f.studio_id = new.studio_id) then
    raise exception 'Renewal must be for a family of this studio' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger renewal_response_guard before insert or update on public.renewal_response
  for each row execute function app_private.check_renewal_response();

create policy renewal_campaign_staff_all on public.renewal_campaign
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

create policy renewal_response_staff_all on public.renewal_response
  for all to authenticated
  using (app_private.has_studio_role(studio_id, array['owner','admin','teacher']))
  with check (app_private.has_studio_role(studio_id, array['owner','admin','teacher']));

do $$
declare
  t text;
begin
  foreach t in array array['renewal_campaign', 'renewal_response'] loop
    execute format('create policy access_gate_select on public.%I as restrictive for select to authenticated using (app_private.studio_can_read(studio_id))', t);
    execute format('create policy access_gate_insert on public.%I as restrictive for insert to authenticated with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_update on public.%I as restrictive for update to authenticated using (app_private.studio_can_write(studio_id)) with check (app_private.studio_can_write(studio_id))', t);
    execute format('create policy access_gate_delete on public.%I as restrictive for delete to authenticated using (app_private.studio_can_write(studio_id))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
