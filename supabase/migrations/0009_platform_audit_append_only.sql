-- 0009: make platform_audit really append-only (expand; safe with the live code, which only
-- inserts and reads platform_audit).
--
-- Found by the first CI run of the pgTAP tests (PR #27):
--  * The append-only trigger from 0005 was SECURITY DEFINER, so inside it current_user was always
--    the owner (postgres) and it never raised. The service key could edit or delete audit rows.
--  * Signed-in users had UPDATE and DELETE grants; RLS silently matched no rows instead of
--    refusing. Now the grants are gone, so an attempt fails loudly.
create or replace function app_private.platform_audit_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'platform_audit is append-only';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke update, delete, truncate on table public.platform_audit from anon, authenticated, service_role;
