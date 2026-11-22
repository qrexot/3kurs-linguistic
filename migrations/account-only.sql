-- Account proof is independent of the access policy to avoid recursive checks.
create function lecture_private.verified_reader_id() returns uuid
language sql stable security definer set search_path='' as $$
 select a.id from lecture_private.reader_accounts a
 join lecture_private.reader_bindings b on b.account_id=a.id
 join lecture_private.reader_sessions s on s.binding_id=b.id
 where a.active and b.active and b.user_id=auth.uid() and s.expires_at>now()
 and b.browser_hash=encode(extensions.digest(split_part(substring(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info' from 8),'.',1),'sha256'),'hex')
 and s.token_hash=encode(extensions.digest(split_part(substring(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info' from 8),'.',2),'sha256'),'hex') limit 1
$$;
revoke all on function lecture_private.verified_reader_id() from public,anon,authenticated;
create or replace function lecture_private.reader_ip_allowed() returns boolean language sql stable set search_path='' as $$select false$$;
create or replace function lecture_private.reader_can_bypass_pause() returns boolean language sql stable set search_path='' as $$select false$$;
create or replace function lecture_private.reader_pause_access() returns boolean language sql stable set search_path='' as $$select false$$;
create or replace function lecture_private.site_is_open() returns boolean language sql stable security definer set search_path='' as $$select lecture_private.is_admin() or not coalesce((select paused from public.site_availability where id=1),false)$$;
create or replace function lecture_private.reader_authorized() returns boolean language sql stable security definer set search_path='' as $$select lecture_private.is_admin() or (lecture_private.site_is_open() and lecture_private.verified_reader_id() is not null)$$;
create or replace function lecture_private.current_reader_id() returns uuid language sql stable security definer set search_path='' as $$ select case when lecture_private.session_allowed() then lecture_private.verified_reader_id() end $$;
delete from lecture_private.reader_allowed_ips;
update lecture_private.reader_accounts set pause_bypass=false where pause_bypass;
update public.site_availability set paused=false where id=1 and paused;
revoke execute on function public.admin_set_reader_ip(text,boolean) from public,anon,authenticated;
