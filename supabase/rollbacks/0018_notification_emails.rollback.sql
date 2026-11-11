-- Rollback 0018 notification emails. Deletes everyone's email switches and the sent log
-- (unsubscribes are lost). Unschedule the pg_cron job first (docs/security/notifications.md).
-- Transaction; staging first.
drop function if exists public.notify_unsubscribe(uuid, text);
drop function if exists public.notify_marking_candidates(timestamptz);
drop function if exists public.notify_news_candidates(timestamptz);
drop function if exists app_private.news_post_family_ids(public.news_post);
drop function if exists public.notify_chat_candidates(interval, interval);
drop function if exists public.notify_ensure_preferences(uuid[]);
drop table if exists public.notification_log;
drop table if exists public.notification_preference;
drop function if exists app_private.notification_preference_guard();
notify pgrst, 'reload schema';
