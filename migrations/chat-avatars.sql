insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('chat-avatars','chat-avatars',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy chat_avatars_insert on storage.objects for insert to authenticated with check(bucket_id='chat-avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.chat_me() is not null);
create policy chat_avatars_read on storage.objects for select to authenticated using(bucket_id='chat-avatars' and public.chat_me() is not null);
create policy chat_avatars_delete_own on storage.objects for delete to authenticated using(bucket_id='chat-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create or replace function public.chat_update_profile(p_bio text,p_avatar_path text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.chat_me() is null then raise exception 'access_denied';end if;
 if char_length(coalesce(p_bio,''))>240 then raise exception 'bio_too_long';end if;
 if p_avatar_path is not null and (p_avatar_path not like auth.uid()::text||'/%' or not exists(select 1 from storage.objects where bucket_id in ('chat-files','chat-avatars') and name=p_avatar_path and owner_id=auth.uid()::text and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 5242880)) then raise exception 'invalid_avatar';end if;
 update public.chat_users set bio=trim(coalesce(p_bio,'')),avatar_path=p_avatar_path where user_id=auth.uid();
 return public.chat_public_profile((select username from public.chat_users where user_id=auth.uid()));
end $$;