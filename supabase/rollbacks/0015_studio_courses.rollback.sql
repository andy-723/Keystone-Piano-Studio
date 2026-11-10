-- Rollback 0015 studio courses. Deletes saved student courses and studio Library templates. Transaction; staging first.
drop table if exists public.student_course;
drop table if exists public.library_item;
drop function if exists app_private.check_course_student();
notify pgrst, 'reload schema';
