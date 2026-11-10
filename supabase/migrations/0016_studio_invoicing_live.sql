-- Studio invoicing, live (0016): lets studio staff use the 0004 invoice tables from the app with
-- their own sign-in.
--
-- 0004 kept invoice and credit note numbering in service-role-only functions. Staff now call
-- send_studio_invoice / issue_studio_credit_note_number, which check the caller's studio role
-- and the 0006 write gate, then use the same gapless numbering. Every studio gets a billing
-- profile row (there was no insert path). Once numbering is locked, staff cannot change the
-- prefixes or next numbers directly. Expand only.

-- One billing profile per studio, now and for new studios.
insert into public.studio_billing_profile (studio_id)
select s.id from public.studio s
on conflict (studio_id) do nothing;

create or replace function app_private.create_billing_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.studio_billing_profile (studio_id) values (new.id)
  on conflict (studio_id) do nothing;
  return new;
end;
$$;

create trigger studio_billing_profile_create after insert on public.studio
  for each row execute function app_private.create_billing_profile();

-- Numbering cannot be edited by a signed-in user after the first invoice or credit note.
create or replace function app_private.guard_billing_numbering()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and old.numbering_locked_at is not null
     and (new.invoice_prefix is distinct from old.invoice_prefix
       or new.next_invoice_number is distinct from old.next_invoice_number
       or new.credit_note_prefix is distinct from old.credit_note_prefix
       or new.next_credit_note_number is distinct from old.next_credit_note_number
       or new.numbering_locked_at is distinct from old.numbering_locked_at)
  then
    raise exception 'Invoice numbering is locked after the first send' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger studio_billing_profile_numbering_guard before update on public.studio_billing_profile
  for each row execute function app_private.guard_billing_numbering();

create or replace function app_private.require_billing_staff(p_studio_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_studio_id is null
     or not app_private.has_studio_role(p_studio_id, array['owner','admin','teacher'])
     or not app_private.studio_can_write(p_studio_id)
  then
    raise exception 'Not allowed for this studio' using errcode = '42501';
  end if;
end;
$$;

-- Numbers and sends a draft invoice. Idempotent: a sent invoice comes back unchanged.
create or replace function public.send_studio_invoice(p_invoice_id uuid)
returns public.invoice
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select i.studio_id into target from public.invoice i where i.id = p_invoice_id;
  perform app_private.require_billing_staff(target);
  insert into public.studio_billing_profile (studio_id) values (target)
  on conflict (studio_id) do nothing;
  return public.send_invoice(p_invoice_id);
end;
$$;

create or replace function public.issue_studio_credit_note_number(p_studio_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated text;
begin
  perform app_private.require_billing_staff(p_studio_id);
  insert into public.studio_billing_profile (studio_id) values (p_studio_id)
  on conflict (studio_id) do nothing;
  allocated := public.issue_credit_note_number(p_studio_id);
  update public.studio_billing_profile
  set numbering_locked_at = coalesce(numbering_locked_at, now())
  where studio_id = p_studio_id;
  return allocated;
end;
$$;

revoke all on function public.send_studio_invoice(uuid) from public, anon;
revoke all on function public.issue_studio_credit_note_number(uuid) from public, anon;
grant execute on function public.send_studio_invoice(uuid) to authenticated;
grant execute on function public.issue_studio_credit_note_number(uuid) to authenticated;
revoke all on function app_private.require_billing_staff(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
