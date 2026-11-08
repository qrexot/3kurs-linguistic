-- Retire chat without touching lecture data, visitor access, or site notifications.
-- Delete chat-files/chat-avatars via the Storage API; never delete storage.objects in SQL.
begin;
delete from public.user_notifications where kind in ('chat_reply','chat_moderation') or target='chat.html';
drop policy if exists chat_storage_upload on storage.objects;
drop policy if exists chat_storage_read on storage.objects;
drop policy if exists chat_storage_delete_own on storage.objects;
drop policy if exists chat_avatars_insert on storage.objects;
drop policy if exists chat_avatars_read on storage.objects;
drop policy if exists chat_avatars_delete_own on storage.objects;
drop function if exists public.chat_react(bigint,text);
drop function if exists public.chat_send(text,bigint,text,text,text,bigint);
drop function if exists public.chat_list(bigint,integer);
drop function if exists public.chat_update_profile(text,text);
drop function if exists public.chat_public_profile(text);
drop function if exists public.chat_set_username(text);
drop function if exists public.chat_admin_users();
drop function if exists public.chat_moderate_reason(uuid,text,integer,text);
drop function if exists public.chat_moderate(uuid,text,integer);
drop function if exists public.chat_can_send();
drop function if exists public.chat_me();
drop table if exists public.chat_reactions,public.chat_messages,public.chat_users;
drop function if exists lecture_private.notify_chat_reply();
drop function if exists lecture_private.notify_chat_moderation();
commit;
