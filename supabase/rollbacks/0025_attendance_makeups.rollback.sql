-- Rollback 0025 attendance and make-up credits. Deletes saved lesson marks and the make-up credit history for real studios. Transaction; staging first.
drop table if exists public.makeup_credit;
drop table if exists public.lesson_attendance;
drop function if exists app_private.check_makeup_credit();
drop function if exists app_private.check_lesson_attendance();
notify pgrst, 'reload schema';
