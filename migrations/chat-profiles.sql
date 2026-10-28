alter table public.chat_users add column bio text not null default '' check(char_length(bio)<=240), add column avatar_path text;
create function public.chat_public_profile(p_username text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null or not lecture_private.session_allowed() or public.chat_me() is null then raise exception 'access_denied';end if;
 select jsonb_build_object('username',username,'bio',bio,'avatar_path',avatar_path,'mine',user_id=auth.uid()) into result from public.chat_users where lower(username)=lower(trim(p_username));
 if result is null then raise exception 'profile_not_found';end if;return result;
end $$;
create function public.chat_update_profile(p_bio text,p_avatar_path text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.chat_can_send() then raise exception 'access_denied';end if;
 if char_length(coalesce(p_bio,''))>240 then raise exception 'bio_too_long';end if;
 if p_avatar_path is not null and (p_avatar_path not like auth.uid()::text||'/%' or not exists(select 1 from storage.objects where bucket_id='chat-files' and name=p_avatar_path and owner_id=auth.uid()::text and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 5242880)) then raise exception 'invalid_avatar';end if;
 update public.chat_users set bio=trim(coalesce(p_bio,'')),avatar_path=p_avatar_path where user_id=auth.uid();
 return public.chat_public_profile((select username from public.chat_users where user_id=auth.uid()));
end $$;
revoke all on function public.chat_public_profile(text),public.chat_update_profile(text,text) from public,anon;
grant execute on function public.chat_public_profile(text),public.chat_update_profile(text,text) to authenticated;
