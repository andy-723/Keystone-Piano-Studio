-- 0022 Xero sync for Pro studios (19 Nov 2026).
-- A studio owner connects their Xero organisation (OAuth 2.0, granular scopes). Keystone pushes
-- sent invoices and recorded payments to Xero every 15 minutes (and on "Sync now"). One-way:
-- nothing is read back from Xero except the chart of accounts for the account pickers.
-- Reuses public.oauth_connection from 0003 (provider 'xero'); tokens live in Vault and never
-- reach the browser. Expand-only.

alter table public.oauth_connection
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists last_error text check (char_length(last_error) <= 500),
  add column if not exists connected_by uuid;

-- Owners/admins may see the account choices and the last error (never token columns).
grant select (settings, last_error) on table public.oauth_connection to authenticated;

-- Which Xero record each Keystone record became, so nothing is pushed twice.
alter table public.invoice add column if not exists xero_invoice_id text;
alter table public.payment add column if not exists xero_payment_id text;
alter table public.family add column if not exists xero_contact_id text;

create index if not exists invoice_xero_unsynced_idx
  on public.invoice (studio_id) where xero_invoice_id is null and status <> 'draft';
create index if not exists payment_xero_unsynced_idx
  on public.payment (studio_id) where xero_payment_id is null;

-- ---------------------------------------------------------------------------
-- Vault helpers. service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.xero_connection_save(
  p_studio_id uuid,
  p_tenant_id text,
  p_tenant_name text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_user_id uuid,
  p_settings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.oauth_connection;
  access_secret uuid;
  refresh_secret uuid;
  result uuid;
begin
  -- One Xero organisation per studio: a new connection replaces the old one.
  for existing in
    select * from public.oauth_connection where studio_id = p_studio_id and provider = 'xero'
  loop
    if existing.access_token_secret_id is not null then
      delete from vault.secrets where id = existing.access_token_secret_id;
    end if;
    if existing.refresh_token_secret_id is not null then
      delete from vault.secrets where id = existing.refresh_token_secret_id;
    end if;
    delete from public.oauth_connection where id = existing.id;
  end loop;

  access_secret := vault.create_secret(p_access_token, 'xero_access_' || gen_random_uuid()::text,
                                       'Keystone Xero access token');
  refresh_secret := vault.create_secret(p_refresh_token, 'xero_refresh_' || gen_random_uuid()::text,
                                        'Keystone Xero refresh token');

  insert into public.oauth_connection
    (studio_id, provider, external_org_id, display_name, access_token_secret_id,
     refresh_token_secret_id, access_expires_at, status, connected_by, settings)
  values
    (p_studio_id, 'xero', p_tenant_id, p_tenant_name, access_secret, refresh_secret,
     p_expires_at, 'connected', p_user_id, coalesce(p_settings, '{}'::jsonb))
  returning id into result;
  return result;
end;
$$;

create or replace function public.xero_connection_tokens(p_connection_id uuid)
returns table (access_token text, refresh_token text, expires_at timestamptz, token_version bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select a.decrypted_secret, r.decrypted_secret, c.access_expires_at, c.token_version
  from public.oauth_connection c
  join vault.decrypted_secrets a on a.id = c.access_token_secret_id
  join vault.decrypted_secrets r on r.id = c.refresh_token_secret_id
  where c.id = p_connection_id and c.provider = 'xero' and c.status = 'connected';
$$;

-- Compare-and-swap: only the worker holding the refresh lease (claim_oauth_refresh, 0003) at
-- the version it read may store the rotated tokens.
create or replace function public.xero_connection_rotate(
  p_connection_id uuid,
  p_owner text,
  p_expected_version bigint,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.oauth_connection;
begin
  select * into c from public.oauth_connection
   where id = p_connection_id
     and token_version = p_expected_version
     and refresh_lease_owner = p_owner
     and refresh_lease_until >= now()
   for update;
  if not found then
    return false;
  end if;
  perform vault.update_secret(c.access_token_secret_id, p_access_token);
  perform vault.update_secret(c.refresh_token_secret_id, p_refresh_token);
  update public.oauth_connection
     set access_expires_at = p_expires_at,
         token_version = token_version + 1,
         refresh_lease_owner = null,
         refresh_lease_until = null
   where id = p_connection_id;
  return true;
end;
$$;

create or replace function public.xero_connection_forget(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.oauth_connection;
begin
  select * into c from public.oauth_connection where id = p_connection_id;
  if not found then
    return;
  end if;
  update public.oauth_connection
     set status = 'disconnected', access_token_secret_id = null, refresh_token_secret_id = null
   where id = p_connection_id;
  if c.access_token_secret_id is not null then
    delete from vault.secrets where id = c.access_token_secret_id;
  end if;
  if c.refresh_token_secret_id is not null then
    delete from vault.secrets where id = c.refresh_token_secret_id;
  end if;
end;
$$;

revoke all on function public.xero_connection_save(uuid, text, text, text, text, timestamptz, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.xero_connection_tokens(uuid) from public, anon, authenticated;
revoke all on function public.xero_connection_rotate(uuid, text, bigint, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.xero_connection_forget(uuid) from public, anon, authenticated;
grant execute on function public.xero_connection_save(uuid, text, text, text, text, timestamptz, uuid, jsonb) to service_role;
grant execute on function public.xero_connection_tokens(uuid) to service_role;
grant execute on function public.xero_connection_rotate(uuid, text, bigint, text, text, timestamptz) to service_role;
grant execute on function public.xero_connection_forget(uuid) to service_role;

notify pgrst, 'reload schema';
