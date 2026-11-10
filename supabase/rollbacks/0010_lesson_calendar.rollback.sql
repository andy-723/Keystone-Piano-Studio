-- Rollback 0010 lesson calendar. Local rehearsal only.
-- Removes Vault secrets created for Google Calendar before dropping the table that points at them.

delete from vault.secrets
 where id in (select refresh_token_secret_id from public.calendar_connection where refresh_token_secret_id is not null);

drop function if exists public.calendar_connection_forget(uuid);
drop function if exists public.calendar_connection_refresh_token(uuid);
drop function if exists public.calendar_connection_save(uuid, uuid, text, text, text);
drop table if exists public.calendar_connection;
drop table if exists public.lesson_exception;
drop table if exists public.lesson_series;
drop function if exists app_private.lesson_same_studio();
