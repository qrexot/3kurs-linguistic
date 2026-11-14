begin;
alter table lecture_private.reader_accounts add column if not exists pause_bypass boolean not null default false;
create or replace function lecture_private.reader_can_bypass_pause() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from lecture_private.reader_bindings b
  join lecture_private.reader_accounts a on a.id=b.account_id
  join lecture_private.reader_sessions s on s.binding_id=b.id
  where a.active and a.pause_bypass and b.active and b.user_id=auth.uid() and s.expires_at>now()
   and b.browser_hash=encode(extensions.digest(split_part(substring(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','') from 8),'.',1),'sha256'),'hex')
   and s.token_hash=encode(extensions.digest(split_part(substring(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','') from 8),'.',2),'sha256'),'hex')
 );
$$;
revoke all on function lecture_private.reader_can_bypass_pause() from public,anon,authenticated;
create or replace function lecture_private.site_is_open() returns boolean
language sql stable security definer set search_path='' as $$
 select lecture_private.is_admin() or not coalesce((select paused from public.site_availability where id=1),false)
   or lecture_private.reader_can_bypass_pause();
$$;
create or replace function lecture_private.session_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and not p.blocked)
 and not exists(select 1 from public.devices d where d.owner_id=auth.uid() and d.blocked)
 and not exists(select 1 from public.visitor_name_requirements where user_id=auth.uid())
 and lecture_private.reader_authorized() and lecture_private.site_is_open();
$$;
CREATE OR REPLACE FUNCTION lecture_private.reader_login(p_login text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a lecture_private.reader_accounts; b lecture_private.reader_bindings; login_name text:=lower(trim(coalesce(p_login,'')));
 h jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');browser_key text;proof text;ip text;n integer;k text;valid boolean;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'code','session');end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and not blocked) or exists(select 1 from public.devices where owner_id=auth.uid() and blocked) then return jsonb_build_object('ok',false,'code','denied');end if;
 browser_key:=split_part(substring(h->>'x-client-info' from 8),'.',1);proof:=split_part(substring(h->>'x-client-info' from 8),'.',2);
 if browser_key is null or proof is null or browser_key !~ '^[a-f0-9]{64}$' or proof !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','storage');end if;
 if length(login_name) not between 1 and 16 or octet_length(coalesce(p_password,''))>72 then return jsonb_build_object('ok',false,'code','credentials');end if;
 ip:=left(trim(split_part(coalesce(nullif(h->>'x-real-ip',''),nullif(h->>'x-forwarded-for',''),auth.uid()::text),',',1)),100);
 delete from lecture_private.reader_login_limits where window_start<now()-interval '1 day';
 delete from lecture_private.reader_sessions where expires_at<now();
 foreach k in array array['ip:'||ip,'login:'||login_name] loop
  k:=encode(extensions.digest(k,'sha256'),'hex');
  insert into lecture_private.reader_login_limits(key) values(k) on conflict(key) do update set
   attempts=case when reader_login_limits.window_start<now()-interval '15 minutes' then 1 else reader_login_limits.attempts+1 end,
   window_start=case when reader_login_limits.window_start<now()-interval '15 minutes' then now() else reader_login_limits.window_start end returning attempts into n;
  if n>(case when k=encode(extensions.digest('ip:'||ip,'sha256'),'hex') then 200 else 5 end) then return jsonb_build_object('ok',false,'code','rate_limit');end if;
 end loop;
 -- Account row lock serializes simultaneous first logins and enforces the browser limit atomically.
 select * into a from lecture_private.reader_accounts where login=login_name for update;
 valid:=extensions.crypt(coalesce(p_password,''),coalesce(a.password_hash,'$2a$12$4BAh.ANgFkOJicQj9laQCO9rn2HTvBFN4XQ1uQ7kJGATMnCa6ByPe'))=a.password_hash;
 if a.id is null or not a.active or not coalesce(valid,false) then return jsonb_build_object('ok',false,'code','credentials');end if;
 if not a.pause_bypass and coalesce((select paused from public.site_availability where id=1),false) then return jsonb_build_object('ok',false,'code','paused');end if;
 select * into b from lecture_private.reader_bindings where account_id=a.id and user_id=auth.uid() and active;
 if b.id is not null and b.browser_hash<>encode(extensions.digest(browser_key,'sha256'),'hex') then return jsonb_build_object('ok',false,'code','bound');end if;
 if b.id is null then
  if exists(select 1 from lecture_private.reader_bindings where user_id=auth.uid() and active) then return jsonb_build_object('ok',false,'code','browser_in_use');end if;
  if a.max_browsers is not null and (select count(*) from lecture_private.reader_bindings where account_id=a.id and active)>=a.max_browsers then return jsonb_build_object('ok',false,'code','capacity');end if;
  insert into lecture_private.reader_bindings(account_id,user_id,browser_hash,last_browser) values(a.id,auth.uid(),encode(extensions.digest(browser_key,'sha256'),'hex'),left(h->>'user-agent',512)) returning * into b;
 end if;
 insert into lecture_private.reader_sessions(token_hash,binding_id) values(encode(extensions.digest(proof,'sha256'),'hex'),b.id) on conflict(token_hash) do update set expires_at=now()+interval '8 hours' where reader_sessions.binding_id=b.id;
 perform lecture_private.reader_touch_binding(b.id);
 update public.profiles set display_name=coalesce(nullif(a.label,''),a.login) where id=auth.uid() and not is_admin;
 delete from lecture_private.reader_login_limits where key=encode(extensions.digest('login:'||login_name,'sha256'),'hex');
 update lecture_private.reader_login_limits set attempts=greatest(0,attempts-1) where key=encode(extensions.digest('ip:'||ip,'sha256'),'hex');
 return jsonb_build_object('ok',true);
end;$function$;

CREATE OR REPLACE FUNCTION lecture_private.admin_reader_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
 select a.id,a.login,a.label,a.active,a.max_browsers,a.created_at,a.pause_bypass,
 (select count(*) from lecture_private.reader_bindings b where b.account_id=a.id and b.active) as browser_count,
 coalesce((select jsonb_agg(to_jsonb(y) order by y.created_at) from (
  select b.id,b.active,b.created_at,b.last_seen,b.last_browser,
   (select count(*) from lecture_private.reader_binding_ips i where i.binding_id=b.id) as ip_count,
   coalesce((select jsonb_agg(to_jsonb(z) order by z.last_seen desc) from (select ip,first_seen,last_seen from lecture_private.reader_binding_ips i where i.binding_id=b.id order by last_seen desc limit 100) z),'[]'::jsonb) as ips
  from lecture_private.reader_bindings b where b.account_id=a.id
 ) y),'[]'::jsonb) as browsers
 from lecture_private.reader_accounts a) x),'[]'::jsonb);
end;$function$;

CREATE OR REPLACE FUNCTION lecture_private.admin_update_reader_account(p_id uuid, p_action text, p_password text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 perform 1 from lecture_private.reader_accounts where id=p_id for update;
 if not found then raise exception 'Аккаунт не найден.';end if;
 if p_action='disable' then
  update lecture_private.reader_accounts set active=false where id=p_id;
  delete from lecture_private.reader_sessions where binding_id in (select id from lecture_private.reader_bindings where account_id=p_id);
 elsif p_action='enable' then update lecture_private.reader_accounts set active=true where id=p_id;
 elsif p_action in ('reset_browser','password') then
  if p_action='password' then
   if (select pause_bypass from lecture_private.reader_accounts where id=p_id) and (char_length(coalesce(p_password,''))<12 or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]') then raise exception 'Для специального доступа нужен пароль от 12 символов с буквами и цифрами.'; end if;
   if char_length(coalesce(p_password,''))<3 or octet_length(p_password)>72 then raise exception 'Пароль: минимум 3 символа, максимум 72 байта.';end if;
   update lecture_private.reader_accounts set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)) where id=p_id;
  end if;
  delete from lecture_private.reader_bindings where account_id=p_id;
  delete from lecture_private.reader_login_limits where key=encode(extensions.digest('login:'||(select login from lecture_private.reader_accounts where id=p_id),'sha256'),'hex');
 else raise exception 'Недопустимое действие.';end if;
end;$function$;

create or replace function lecture_private.admin_create_reader_account_v3(p_login text,p_password text,p_label text default '',p_limit integer default 1,p_pause_bypass boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare account_id uuid;
begin
 if not lecture_private.is_admin() then raise exception 'access_denied'; end if;
 if p_pause_bypass is null then raise exception 'invalid_option'; end if;
 if p_pause_bypass and (char_length(coalesce(p_password,'')) < 12 or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]') then
  raise exception 'Для специального доступа нужен пароль от 12 символов с буквами и цифрами.';
 end if;
 account_id:=lecture_private.admin_create_reader_account_v2(p_login,p_password,p_label,p_limit);
 update lecture_private.reader_accounts set pause_bypass=p_pause_bypass where id=account_id;
 return account_id;
end;
$$;
revoke all on function lecture_private.admin_create_reader_account_v3(text,text,text,integer,boolean) from public,anon;
grant execute on function lecture_private.admin_create_reader_account_v3(text,text,text,integer,boolean) to authenticated;
create or replace function public.admin_create_reader_account_v3(p_login text,p_password text,p_label text default '',p_limit integer default 1,p_pause_bypass boolean default false) returns uuid
language sql security invoker set search_path='' as $$
 select lecture_private.admin_create_reader_account_v3(p_login,p_password,p_label,p_limit,p_pause_bypass);
$$;
revoke all on function public.admin_create_reader_account_v3(text,text,text,integer,boolean) from public,anon;
grant execute on function public.admin_create_reader_account_v3(text,text,text,integer,boolean) to authenticated;
create or replace function lecture_private.reader_pause_access() returns boolean
language sql stable security definer set search_path='' as $$
 select lecture_private.session_allowed() and lecture_private.reader_can_bypass_pause();
$$;
revoke all on function lecture_private.reader_pause_access() from public,anon;
grant execute on function lecture_private.reader_pause_access() to authenticated;
create or replace function public.reader_pause_access() returns boolean
language sql security invoker set search_path='' as $$
 select lecture_private.reader_pause_access();
$$;
revoke all on function public.reader_pause_access() from public,anon;
grant execute on function public.reader_pause_access() to authenticated;
commit;
