-- Rollback for 0008. Restores the broken state (RLS helpers fail for signed-in users).
revoke execute on function auth.jwt() from tenancy_helper;
revoke execute on function auth.uid() from tenancy_helper;
revoke usage on schema auth from tenancy_helper;
