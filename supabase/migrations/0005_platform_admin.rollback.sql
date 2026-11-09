-- Rollback 0005 platform admin. Local rehearsal only.

drop trigger if exists platform_audit_append_only on public.platform_audit;
drop function if exists app_private.platform_audit_append_only();
drop function if exists public.create_studio_with_owner(text, text, uuid, uuid);
drop function if exists app_private.create_studio_with_owner(text, text, uuid, uuid);
drop function if exists app_private.is_platform_admin();

drop policy if exists platform_audit_admin_select on public.platform_audit;
drop policy if exists platform_staff_select on public.platform_staff;
drop policy if exists tenancy_helper_platform_staff_select on public.platform_staff;

drop table if exists public.platform_audit;
drop table if exists public.platform_staff;
