-- Rollback 0014 studio news. Deletes saved news posts and manual groups. Transaction; staging first.
drop table if exists public.news_post;
drop table if exists public.student_group;
drop function if exists app_private.check_group_students();
notify pgrst, 'reload schema';
