-- 0008: let tenancy_helper call auth.uid() and auth.jwt() (expand; safe with the live code).
--
-- Found by the first CI run of the pgTAP tests (PR #27): every RLS helper owned by
-- tenancy_helper (0003, 0005, 0006) is SECURITY DEFINER and calls auth.uid(), so it runs as
-- tenancy_helper, which had no USAGE on schema auth. Any query by a signed-in user that reached
-- those policies failed with "permission denied for schema auth". Server code using the service
-- key bypasses RLS, which is why the app did not show it.
--
-- Grants only the two functions the helpers need; no table in schema auth becomes readable.
grant usage on schema auth to tenancy_helper;
grant execute on function auth.uid() to tenancy_helper;
grant execute on function auth.jwt() to tenancy_helper;
