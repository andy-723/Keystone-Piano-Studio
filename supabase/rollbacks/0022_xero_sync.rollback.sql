-- Rollback 0022 Xero sync. Disconnect every studio first (Settings → Xero → Disconnect) so the
-- Vault tokens are deleted; any left are removed below. Transaction; staging first.
delete from vault.secrets where id in (
  select access_token_secret_id from public.oauth_connection where provider = 'xero'
  union
  select refresh_token_secret_id from public.oauth_connection where provider = 'xero'
);
delete from public.oauth_connection where provider = 'xero';
drop function if exists public.xero_connection_forget(uuid);
drop function if exists public.xero_connection_rotate(uuid, text, bigint, text, text, timestamptz);
drop function if exists public.xero_connection_tokens(uuid);
drop function if exists public.xero_connection_save(uuid, text, text, text, text, timestamptz, uuid, jsonb);
drop index if exists public.payment_xero_unsynced_idx;
drop index if exists public.invoice_xero_unsynced_idx;
alter table public.family drop column if exists xero_contact_id;
alter table public.payment drop column if exists xero_payment_id;
alter table public.invoice drop column if exists xero_invoice_id;
revoke select (settings, last_error) on table public.oauth_connection from authenticated;
alter table public.oauth_connection drop column if exists connected_by;
alter table public.oauth_connection drop column if exists last_error;
alter table public.oauth_connection drop column if exists settings;
notify pgrst, 'reload schema';
