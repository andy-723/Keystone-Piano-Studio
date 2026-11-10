-- Rollback 0007 support requests. Local rehearsal only.

drop policy if exists support_request_select on public.support_request;
drop table if exists public.support_request;
