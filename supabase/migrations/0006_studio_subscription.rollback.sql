-- Rollback 0006 studio subscription. Local rehearsal only.

alter table public.platform_audit drop constraint if exists platform_audit_event_check;
delete from public.platform_audit where event = 'studio_access_changed';
alter table public.platform_audit add constraint platform_audit_event_check check (event in (
  'bootstrap_admin', 'sign_in', 'sign_in_no_account', 'mfa_enrolled', 'mfa_reset',
  'studio_created', 'owner_invited', 'staff_added', 'staff_removed'
));

drop trigger if exists student_plan_cap on public.student;
drop function if exists app_private.enforce_plan_student_cap();

drop policy if exists access_gate_storage_select on storage.objects;
drop policy if exists access_gate_storage_insert on storage.objects;
drop policy if exists access_gate_storage_update on storage.objects;
drop policy if exists access_gate_storage_delete on storage.objects;

do $$
declare
  t text;
begin
  foreach t in array array[
    'studio', 'studio_member', 'family', 'guardian', 'student', 'invitation',
    'invitation_student', 'intake_response', 'terms_document', 'terms_version',
    'terms_acceptance', 'consent_record', 'email_log', 'auth_audit', 'oauth_connection',
    'studio_billing_profile', 'invoice', 'invoice_line', 'payment', 'credit_note', 'invoice_event'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop policy if exists access_gate_select on public.%I', t);
    execute format('drop policy if exists access_gate_insert on public.%I', t);
    execute format('drop policy if exists access_gate_update on public.%I', t);
    execute format('drop policy if exists access_gate_delete on public.%I', t);
  end loop;
end $$;

drop policy if exists studio_subscription_owner_admin_select on public.studio_subscription;
drop policy if exists tenancy_helper_studio_subscription_select on public.studio_subscription;
drop function if exists app_private.studio_can_write(uuid);
drop function if exists app_private.studio_can_read(uuid);
drop function if exists app_private.studio_access_level(uuid);

drop trigger if exists studio_create_subscription on public.studio;
drop function if exists app_private.create_studio_subscription();
drop trigger if exists studio_subscription_touch on public.studio_subscription;
drop function if exists app_private.touch_updated_at();

drop table if exists public.billing_webhook_event;
drop table if exists public.studio_subscription;

notify pgrst, 'reload schema';
