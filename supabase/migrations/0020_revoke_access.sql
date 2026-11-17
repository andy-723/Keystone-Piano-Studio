-- 0020 revoke and restore access (18 Nov 2026).
-- A teacher can revoke one parent's access to the family app for their studio. The parent's
-- auth user id moves from guardian.user_id to guardian.revoked_user_id, so every RLS policy
-- that matches guardian.user_id = auth.uid() stops matching at once; Restore moves it back.
-- Staff and studio owners are revoked with a Supabase Auth ban (no table change).
-- Both audit tables gain access_revoked / access_restored. Expand-only.

alter table public.guardian
  add column if not exists revoked_user_id uuid,
  add column if not exists access_revoked_at timestamptz;

alter table public.platform_audit drop constraint if exists platform_audit_event_check;
alter table public.platform_audit add constraint platform_audit_event_check check (event in (
  'bootstrap_admin',
  'sign_in',
  'sign_in_no_account',
  'mfa_enrolled',
  'mfa_reset',
  'studio_created',
  'owner_invited',
  'staff_added',
  'staff_removed',
  'studio_access_changed',
  'access_revoked',
  'access_restored'
));

alter table public.auth_audit drop constraint if exists auth_audit_event_check;
alter table public.auth_audit add constraint auth_audit_event_check check (event in (
  'invite_opened', 'invite_submitted', 'invite_resent', 'magic_link_requested',
  'sign_in', 'mfa_enrolled', 'mfa_removed', 'token_rejected',
  'access_revoked', 'access_restored'
));

notify pgrst, 'reload schema';
