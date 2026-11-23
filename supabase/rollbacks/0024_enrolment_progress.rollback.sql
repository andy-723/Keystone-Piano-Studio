-- Rollback 0024 enrolment wizard progress. Deletes saved Enrol wizard progress (steps 2-4) for real studios; courses already started are untouched. Transaction; staging first.
drop table if exists public.enrolment_progress;
drop function if exists app_private.check_enrolment_progress();
notify pgrst, 'reload schema';
