-- Run in the Supabase SQL editor of the live project. Do not paste results anywhere public. Record the result in the incident log.
-- Read-only inventory for multi-tenant hardening 0003. ROW COUNTS ONLY — no names, emails or content.

-- Tables from 0001_family_onboarding.sql
select 'studio' as table_name, count(*)::bigint as row_count, min(created_at) as earliest_created_at, max(created_at) as latest_created_at from public.studio
union all select 'studio_member', count(*), min(created_at), max(created_at) from public.studio_member
union all select 'family', count(*), min(created_at), max(created_at) from public.family
union all select 'guardian', count(*), min(created_at), max(created_at) from public.guardian
union all select 'student', count(*), min(created_at), max(created_at) from public.student
union all select 'invitation', count(*), min(created_at), max(created_at) from public.invitation
union all select 'invitation_student', count(*), min(created_at), max(created_at) from public.invitation_student
union all select 'intake_response', count(*), min(created_at), max(created_at) from public.intake_response
union all select 'terms_document', count(*), min(created_at), max(created_at) from public.terms_document
union all select 'terms_version', count(*), min(created_at), max(created_at) from public.terms_version
union all select 'terms_acceptance', count(*), min(created_at), max(created_at) from public.terms_acceptance
union all select 'consent_record', count(*), min(created_at), max(created_at) from public.consent_record
union all select 'email_log', count(*), min(created_at), max(created_at) from public.email_log
union all select 'auth_audit', count(*), min(created_at), max(created_at) from public.auth_audit
order by table_name;

-- auth.users count (no identities)
select 'auth.users' as table_name, count(*)::bigint as row_count from auth.users;

-- storage.objects by bucket
select bucket_id, count(*)::bigint as object_count
from storage.objects
group by bucket_id
order by bucket_id;

-- 0002_native_invoicing.sql tables (run only if that migration exists in the project)
-- Uncomment if present:
-- select 'invoice' as table_name, count(*)::bigint as row_count, min(created_at), max(created_at) from public.invoice
-- union all select 'invoice_line', count(*), min(created_at), max(created_at) from public.invoice_line
-- union all select 'payment_record', count(*), min(created_at), max(created_at) from public.payment_record;
