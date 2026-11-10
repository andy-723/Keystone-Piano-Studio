-- Rollback for 0009: restores 0005's behaviour (trigger never raises; grants back).
alter function app_private.platform_audit_append_only() security definer;
grant update, delete, truncate on table public.platform_audit to authenticated, service_role;
