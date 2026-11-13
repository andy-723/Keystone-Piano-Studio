-- Rollback 0019 student progress snapshots. Deletes the weekly progress history only; courses are untouched. Transaction; staging first.
drop table if exists public.student_progress_snapshot;
drop function if exists app_private.check_progress_snapshot_student();
notify pgrst, 'reload schema';
