begin;
create table lecture_private.reader_accounts (
 id uuid primary key default gen_random_uuid(), login text not null unique check(login ~ '^[a-z0-9_.-]{1,16}$'),
 label text not null default '', password_hash text not null, active boolean not null default true,
 bound_user_id uuid unique references auth.users(id) on delete set null, browser_hash text,
 bound_at timestamptz,last_seen timestamptz,last_ip text,last_browser text,created_at timestamptz not null default now()
);
create table lecture_private.reader_login_limits (key text primary key,window_start timestamptz not null default now(),attempts integer not null default 1);
alter table lecture_private.reader_accounts enable row level security;
alter table lecture_private.reader_login_limits enable row level security;
revoke all on lecture_private.reader_accounts,lecture_private.reader_login_limits from public,anon,authenticated;

create function lecture_private.reader_authorized() returns boolean language sql stable security definer set search_path='' as $$
 select lecture_private.is_admin() or exists (select 1 from lecture_private.reader_accounts a where a.active and a.bound_user_id=auth.uid()
 and a.browser_hash=encode(extensions.digest(coalesce(substring(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info' from 8),''),'sha256'),'hex'));
$$;
revoke all on function lecture_private.reader_authorized() from public,anon;
grant execute on function lecture_private.reader_authorized() to authenticated;
create or replace function lecture_private.session_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and not p.blocked)
 and not exists(select 1 from public.devices d where d.owner_id=auth.uid() and d.blocked)
 and not exists(select 1 from public.visitor_name_requirements where user_id=auth.uid())
 and lecture_private.reader_authorized();
$$;

create function lecture_private.reader_access_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return jsonb_build_object('allowed',false);end if;
 if lecture_private.is_admin() then return jsonb_build_object('allowed',true,'admin',true);end if;
 if not lecture_private.session_allowed() then return jsonb_build_object('allowed',false);end if;
 update lecture_private.reader_accounts set last_seen=now() where bound_user_id=auth.uid() and (last_seen is null or last_seen<now()-interval '5 minutes');
 return jsonb_build_object('allowed',true);
end;$$;

create function lecture_private.reader_login(p_login text,p_password text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a lecture_private.reader_accounts;login_name text:=lower(trim(coalesce(p_login,'')));
 headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 browser_key text;ip text;count_attempts integer;scope_key text;password_matches boolean;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'code','session');end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and not blocked) or exists(select 1 from public.devices where owner_id=auth.uid() and blocked) then return jsonb_build_object('ok',false,'code','denied');end if;
 browser_key:=substring(headers->>'x-client-info' from 8);
 if browser_key is null or browser_key !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','storage');end if;
 if char_length(login_name) not between 1 and 16 or octet_length(coalesce(p_password,''))>72 then return jsonb_build_object('ok',false,'code','credentials');end if;
 ip:=left(trim(split_part(coalesce(nullif(headers->>'x-real-ip',''),nullif(headers->>'x-forwarded-for',''),auth.uid()::text),',',1)),100);
 delete from lecture_private.reader_login_limits where window_start<now()-interval '1 day';
 foreach scope_key in array array['ip:'||ip,'login:'||login_name] loop
  scope_key:=encode(extensions.digest(scope_key,'sha256'),'hex');
  insert into lecture_private.reader_login_limits(key) values(scope_key) on conflict(key) do update set
   attempts=case when reader_login_limits.window_start<now()-interval '15 minutes' then 1 else reader_login_limits.attempts+1 end,
   window_start=case when reader_login_limits.window_start<now()-interval '15 minutes' then now() else reader_login_limits.window_start end returning attempts into count_attempts;
  if count_attempts > (case when scope_key=encode(extensions.digest('ip:'||ip,'sha256'),'hex') then 30 else 5 end) then return jsonb_build_object('ok',false,'code','rate_limit');end if;
 end loop;
 select * into a from lecture_private.reader_accounts where login=login_name for update;
 password_matches:=extensions.crypt(coalesce(p_password,''),coalesce(a.password_hash,'$2a$12$4BAh.ANgFkOJicQj9laQCO9rn2HTvBFN4XQ1uQ7kJGATMnCa6ByPe'))=a.password_hash;
 if a.id is null or not a.active or not coalesce(password_matches,false) then return jsonb_build_object('ok',false,'code','credentials');end if;
 if a.bound_user_id is not null and (a.bound_user_id<>auth.uid() or a.browser_hash<>encode(extensions.digest(browser_key,'sha256'),'hex')) then return jsonb_build_object('ok',false,'code','bound');end if;
 if exists(select 1 from lecture_private.reader_accounts where bound_user_id=auth.uid() and id<>a.id) then return jsonb_build_object('ok',false,'code','browser_in_use');end if;
 update lecture_private.reader_accounts set bound_user_id=auth.uid(),browser_hash=encode(extensions.digest(browser_key,'sha256'),'hex'),bound_at=coalesce(bound_at,now()),last_seen=now(),last_ip=ip,last_browser=left(headers->>'user-agent',512) where id=a.id;
 update public.profiles set display_name=coalesce(nullif(a.label,''),a.login) where id=auth.uid() and not is_admin;
 delete from lecture_private.reader_login_limits where key=encode(extensions.digest('login:'||login_name,'sha256'),'hex');
 return jsonb_build_object('ok',true);
end;$$;

create function lecture_private.admin_reader_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,login,label,active,bound_user_id is not null as bound,bound_at,last_seen,last_ip,last_browser,created_at from lecture_private.reader_accounts) x),'[]'::jsonb);
end;$$;

create function lecture_private.admin_create_reader_account(p_login text,p_password text,p_label text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;login_name text:=lower(trim(coalesce(p_login,'')));
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 if login_name !~ '^[a-z0-9_.-]{1,16}$' then raise exception 'Логин: от 1 до 16 латинских букв, цифры, точка, дефис или подчёркивание.';end if;
 if char_length(coalesce(p_password,''))<3 or octet_length(p_password)>72 then raise exception 'Пароль: минимум 3 символа, максимум 72 байта.';end if;
 insert into lecture_private.reader_accounts(login,label,password_hash) values(login_name,left(trim(coalesce(p_label,'')),100),extensions.crypt(p_password,extensions.gen_salt('bf',12))) returning id into new_id;
 return new_id;
exception when unique_violation then raise exception 'Этот логин уже существует.';
end;$$;

create function lecture_private.admin_update_reader_account(p_id uuid,p_action text,p_password text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 perform 1 from lecture_private.reader_accounts where id=p_id for update;
 if not found then raise exception 'Аккаунт не найден.';end if;
 if p_action='disable' then update lecture_private.reader_accounts set active=false where id=p_id;
 elsif p_action='enable' then update lecture_private.reader_accounts set active=true where id=p_id;
 elsif p_action='reset_browser' then update lecture_private.reader_accounts set bound_user_id=null,browser_hash=null,bound_at=null,last_ip=null,last_browser=null where id=p_id;
 elsif p_action='password' then
  if char_length(coalesce(p_password,''))<3 or octet_length(p_password)>72 then raise exception 'Пароль: минимум 3 символа, максимум 72 байта.';end if;
  update lecture_private.reader_accounts set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),bound_user_id=null,browser_hash=null,bound_at=null,last_ip=null,last_browser=null where id=p_id;
 else raise exception 'Недопустимое действие.';end if;
end;$$;
revoke all on function lecture_private.reader_access_status(),lecture_private.reader_login(text,text),lecture_private.admin_reader_accounts(),lecture_private.admin_create_reader_account(text,text,text),lecture_private.admin_update_reader_account(uuid,text,text) from public,anon;
grant usage on schema lecture_private to authenticated;
grant execute on function lecture_private.reader_access_status(),lecture_private.reader_login(text,text),lecture_private.admin_reader_accounts(),lecture_private.admin_create_reader_account(text,text,text),lecture_private.admin_update_reader_account(uuid,text,text) to authenticated;
create function public.reader_access_status() returns jsonb language sql security invoker set search_path='' as $$select lecture_private.reader_access_status()$$;
create function public.reader_login(p_login text,p_password text) returns jsonb language sql security invoker set search_path='' as $$select lecture_private.reader_login(p_login,p_password)$$;
create function public.admin_reader_accounts() returns jsonb language sql security invoker set search_path='' as $$select lecture_private.admin_reader_accounts()$$;
create function public.admin_create_reader_account(p_login text,p_password text,p_label text default '') returns uuid language sql security invoker set search_path='' as $$select lecture_private.admin_create_reader_account(p_login,p_password,p_label)$$;
create function public.admin_update_reader_account(p_id uuid,p_action text,p_password text default null) returns void language sql security invoker set search_path='' as $$select lecture_private.admin_update_reader_account(p_id,p_action,p_password)$$;
revoke all on function public.reader_access_status(),public.reader_login(text,text),public.admin_reader_accounts(),public.admin_create_reader_account(text,text,text),public.admin_update_reader_account(uuid,text,text) from public,anon;
grant execute on function public.reader_access_status(),public.reader_login(text,text),public.admin_reader_accounts(),public.admin_create_reader_account(text,text,text),public.admin_update_reader_account(uuid,text,text) to authenticated;
create policy reader_account_required on public.lectures as restrictive for select to public using ((select lecture_private.reader_authorized()));
create policy reader_account_required on public.subjects as restrictive for select to public using ((select lecture_private.reader_authorized()));
create policy reader_account_required on public.weeks as restrictive for select to public using ((select lecture_private.reader_authorized()));
create policy reader_account_required on public.site_about as restrictive for select to public using ((select lecture_private.reader_authorized()));
create policy reader_account_required on public.lecture_revisions as restrictive for select to public using ((select lecture_private.reader_authorized()));
CREATE OR REPLACE FUNCTION public.my_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'access_denied'; end if;
 if not lecture_private.session_allowed() then return jsonb_build_object('unread',0,'items','[]'::jsonb);end if;
 select jsonb_build_object('unread',(select count(*) from public.user_notifications n where n.user_id=auth.uid() and n.read_at is null),'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select id,kind,title,body,target,created_at,read_at from public.user_notifications where user_id=auth.uid() order by id desc limit 50) x),'[]'::jsonb)) into result;
 return result;
end $function$

commit;
