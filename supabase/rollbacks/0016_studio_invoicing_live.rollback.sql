-- Rollback 0016 studio invoicing (live). Keeps invoices and billing profile rows. Transaction; staging first.
drop function if exists public.send_studio_invoice(uuid);
drop function if exists public.issue_studio_credit_note_number(uuid);
drop function if exists app_private.require_billing_staff(uuid);
drop trigger if exists studio_billing_profile_numbering_guard on public.studio_billing_profile;
drop function if exists app_private.guard_billing_numbering();
drop trigger if exists studio_billing_profile_create on public.studio;
drop function if exists app_private.create_billing_profile();
notify pgrst, 'reload schema';
