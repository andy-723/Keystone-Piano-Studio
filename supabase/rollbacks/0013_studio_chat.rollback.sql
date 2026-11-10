-- Rollback 0013 studio chat. Deletes every saved chat message. Run in a transaction; staging first.
drop table if exists public.message;
drop table if exists public.conversation;
drop function if exists app_private.touch_conversation();
drop function if exists app_private.message_only_read_at();
drop function if exists app_private.check_chat_studio();
notify pgrst, 'reload schema';
