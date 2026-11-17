-- Rollback 0020 revoke access. Restore every revoked parent first (or they stay locked out),
-- then drop the columns and put the audit event lists back. Transaction; staging first.
update public.guardian set user_id = revoked_user_id
  where user_id is null and revoked_user_id is not null;
-- The audit tables are append-only, so old access_* rows stay: the narrower checks are NOT VALID
-- (they apply to new rows only).
alter table public.platform_audit drop constraint if exists platform_audit_event_check;
alter table public.platform_audit add constraint platform_audit_event_check check (event in (
  'bootstrap_admin', 'sign_in', 'sign_in_no_account', 'mfa_enrolled', 'mfa_reset',
  'studio_created', 'owner_invited', 'staff_added', 'staff_removed', 'studio_access_changed'
)) not valid;
alter table public.auth_audit drop constraint if exists auth_audit_event_check;
alter table public.auth_audit add constraint auth_audit_event_check check (event in (
  'invite_opened', 'invite_submitted', 'invite_resent', 'magic_link_requested',
  'sign_in', 'mfa_enrolled', 'mfa_removed', 'token_rejected'
)) not valid;
alter table public.guardian drop column if exists access_revoked_at;
alter table public.guardian drop column if exists revoked_user_id;
notify pgrst, 'reload schema';
