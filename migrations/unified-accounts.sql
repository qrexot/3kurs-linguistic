alter table lecture_private.chat_members add column account_id uuid unique references lecture_private.reader_accounts(id) on delete set null;
create function lecture_private.current_reader_id() returns uuid language sql stable security definer set search_path='' as $$
select a.id from lecture_private.reader_accounts a join lecture_private.reader_bindings b on b.account_id=a.id join lecture_private.reader_sessions s on s.binding_id=b.id
where a.active and b.active and b.user_id=auth.uid() and s.expires_at>now() and lecture_private.session_allowed()
and b.browser_hash=encode(extensions.digest(split_part(substring(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info' from 8),'.',1),'sha256'),'hex')
and s.token_hash=encode(extensions.digest(split_part(substring(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info' from 8),'.',2),'sha256'),'hex') limit 1 $$;
revoke all on function lecture_private.current_reader_id() from public,anon,authenticated;
create function public.site_account_signed_in() returns boolean language sql stable security definer set search_path='' as $$ select lecture_private.current_reader_id() is not null $$;
create or replace function lecture_private.chat_handle() returns text language plpgsql stable security definer set search_path='' as $$
declare m lecture_private.chat_members;
begin
if not coalesce(lecture_private.session_allowed(),false) then raise exception 'access_denied'; end if;
select * into m from lecture_private.chat_members where account_id=lecture_private.current_reader_id();
if m.chat_banned then raise exception 'chat_banned'; end if;
return m.handle; end $$;
create or replace function lecture_private.chat_join(p_handle text,p_code text,p_restore boolean) returns text language plpgsql security definer set search_path='' as $$
declare aid uuid:=lecture_private.current_reader_id(); name text:=lower(trim(p_handle)); prior text;
begin
if aid is null then raise exception 'account_login_required'; end if;
perform 1 from lecture_private.reader_accounts where id=aid for update;
select handle into prior from lecture_private.chat_members where account_id=aid;
if prior is not null then return lecture_private.chat_handle(); end if;
if name is null or name !~ '^[a-z][a-z0-9_]{2,19}$' then raise exception 'invalid_handle'; end if;
if p_restore then
update lecture_private.chat_members set account_id=aid where handle=name and account_id is null and recovery_hash=extensions.digest(p_code,'sha256'); if not found then raise exception 'invalid_code'; end if;
else
insert into lecture_private.chat_members(handle,recovery_hash,account_id) values(name,extensions.gen_random_bytes(32),aid) on conflict do nothing; if not found then raise exception 'handle_taken'; end if;
end if;return lecture_private.chat_handle();end $$;
create function public.admin_account_handles() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
if not coalesce(lecture_private.is_admin(),false) then raise exception 'access_denied'; end if;
return (select coalesce(jsonb_object_agg(account_id,handle),'{}') from lecture_private.chat_members where account_id is not null);end $$;
revoke all on function public.admin_account_handles(), public.site_account_signed_in() from public,anon;
grant execute on function public.admin_account_handles(), public.site_account_signed_in() to authenticated;
