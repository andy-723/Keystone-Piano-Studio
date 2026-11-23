-- Rollback 0023 practice logs and client notes. Deletes saved practice minutes and teacher notes for real studios. Transaction; staging first.
drop trigger if exists student_client_notes_cleanup on public.student;
drop trigger if exists family_client_notes_cleanup on public.family;
drop function if exists app_private.delete_client_notes_for_subject();
drop table if exists public.practice_log;
drop table if exists public.client_note;
drop function if exists app_private.check_practice_log_student();
drop function if exists app_private.check_client_note_subject();
notify pgrst, 'reload schema';
