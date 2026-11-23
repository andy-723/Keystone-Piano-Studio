-- Rollback 0027 term renewals. Deletes saved renewal invitations and answers for real studios (invoices stay). Transaction; staging first.
drop table if exists public.renewal_response;
drop table if exists public.renewal_campaign;
drop function if exists app_private.check_renewal_response();
notify pgrst, 'reload schema';
