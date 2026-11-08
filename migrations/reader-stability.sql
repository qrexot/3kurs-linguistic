begin;
alter table lecture_private.reader_accounts add column max_browsers integer default 1 check(max_browsers is null or max_browsers>=1);
create table lecture_private.reader_bindings (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references lecture_private.reader_accounts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,browser_hash text not null,active boolean not null default true,
 created_at timestamptz not null default now(),last_seen timestamptz not null default now(),last_browser text
);
create unique index reader_binding_browser on lecture_private.reader_bindings(account_id,browser_hash) where active;
create unique index reader_binding_user on lecture_private.reader_bindings(user_id) where active;
create index reader_binding_account on lecture_private.reader_bindings(account_id,created_at);
create table lecture_private.reader_binding_ips (
 binding_id uuid references lecture_private.reader_bindings(id) on delete cascade,ip text not null check(length(ip)<=100),
 first_seen timestamptz not null default now(),last_seen timestamptz not null default now(),primary key(binding_id,ip)
);
create table lecture_private.reader_sessions (
 token_hash text primary key,binding_id uuid not null references lecture_private.reader_bindings(id) on delete cascade,
 created_at timestamptz not null default now(),expires_at timestamptz not null default (now()+interval '8 hours')
);
create index reader_session_binding on lecture_private.reader_sessions(binding_id);
alter table lecture_private.reader_bindings enable row level security;
alter table lecture_private.reader_binding_ips enable row level security;
alter table lecture_private.reader_sessions enable row level security;
revoke all on lecture_private.reader_bindings,lecture_private.reader_binding_ips,lecture_private.reader_sessions from public,anon,authenticated;
insert into lecture_private.reader_bindings(account_id,user_id,browser_hash,created_at,last_seen,last_browser)
 select id,bound_user_id,browser_hash,coalesce(bound_at,now()),coalesce(last_seen,now()),last_browser from lecture_private.reader_accounts where bound_user_id is not null and browser_hash is not null;
insert into lecture_private.reader_binding_ips(binding_id,ip)
 select b.id,a.last_ip from lecture_private.reader_bindings b join lecture_private.reader_accounts a on a.id=b.account_id where nullif(a.last_ip,'') is not null;

create or replace function lecture_private.reader_authorized() returns boolean language sql stable security definer set search_path='' as $$
 select lecture_private.is_admin() or exists (
 select 1 from lecture_private.reader_bindings b join lecture_private.reader_accounts a on a.id=b.account_id
 join lecture_private.reader_sessions s on s.binding_id=b.id
 where a.active and b.active and b.user_id=auth.uid() and s.expires_at>now()
 and b.browser_hash=encode(extensions.digest(split_part(substring(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','') from 8),'.',1),'sha256'),'hex')
 and s.token_hash=encode(extensions.digest(split_part(substring(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','') from 8),'.',2),'sha256'),'hex')
 );
$$;
create function lecture_private.reader_touch_binding(p_binding uuid) returns void language plpgsql security definer set search_path='' as $$
declare h jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');ip_address text;
begin
 if not exists(select 1 from lecture_private.reader_bindings where id=p_binding and user_id=auth.uid() and active) then raise exception 'access_denied';end if;
 ip_address:=left(trim(split_part(coalesce(nullif(h->>'x-real-ip',''),nullif(h->>'x-forwarded-for',''),''),',',1)),100);
 if ip_address<>'' then insert into lecture_private.reader_binding_ips(binding_id,ip) values(p_binding,ip_address) on conflict(binding_id,ip) do update set last_seen=now() where reader_binding_ips.last_seen<now()-interval '1 minute';end if;
 update lecture_private.reader_bindings set last_seen=now(),last_browser=coalesce(left(h->>'user-agent',512),last_browser) where id=p_binding and last_seen<now()-interval '1 minute';
end;$$;
revoke all on function lecture_private.reader_touch_binding(uuid) from public,anon,authenticated;

create or replace function lecture_private.reader_access_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare binding uuid;
begin
 if auth.uid() is null then return jsonb_build_object('allowed',false);end if;
 if lecture_private.is_admin() then return jsonb_build_object('allowed',true,'admin',true);end if;
 if not lecture_private.session_allowed() then return jsonb_build_object('allowed',false);end if;
 select id into binding from lecture_private.reader_bindings where user_id=auth.uid() and active;
 perform lecture_private.reader_touch_binding(binding);
 return jsonb_build_object('allowed',true);
end;$$;

create or replace function lecture_private.reader_login(p_login text,p_password text) returns jsonb language plpgsql security definer set search_path='' as $$
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
end;$$;

create or replace function lecture_private.admin_reader_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
 select a.id,a.login,a.label,a.active,a.max_browsers,a.created_at,
 (select count(*) from lecture_private.reader_bindings b where b.account_id=a.id and b.active) as browser_count,
 coalesce((select jsonb_agg(to_jsonb(y) order by y.created_at) from (
  select b.id,b.active,b.created_at,b.last_seen,b.last_browser,
   (select count(*) from lecture_private.reader_binding_ips i where i.binding_id=b.id) as ip_count,
   coalesce((select jsonb_agg(to_jsonb(z) order by z.last_seen desc) from (select ip,first_seen,last_seen from lecture_private.reader_binding_ips i where i.binding_id=b.id order by last_seen desc limit 100) z),'[]'::jsonb) as ips
  from lecture_private.reader_bindings b where b.account_id=a.id
 ) y),'[]'::jsonb) as browsers
 from lecture_private.reader_accounts a) x),'[]'::jsonb);
end;$$;

create or replace function lecture_private.admin_update_reader_account(p_id uuid,p_action text,p_password text default null) returns void language plpgsql security definer set search_path='' as $$
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
   if char_length(coalesce(p_password,''))<3 or octet_length(p_password)>72 then raise exception 'Пароль: минимум 3 символа, максимум 72 байта.';end if;
   update lecture_private.reader_accounts set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)) where id=p_id;
  end if;
  delete from lecture_private.reader_bindings where account_id=p_id;
  delete from lecture_private.reader_login_limits where key=encode(extensions.digest('login:'||(select login from lecture_private.reader_accounts where id=p_id),'sha256'),'hex');
 else raise exception 'Недопустимое действие.';end if;
end;$$;
create function lecture_private.admin_set_reader_limit(p_id uuid,p_limit integer default 1) returns void language plpgsql security definer set search_path='' as $$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 if p_limit is not null and p_limit<1 then raise exception 'Лимит должен быть не меньше 1.';end if;
 perform 1 from lecture_private.reader_accounts where id=p_id for update;
 if not found then raise exception 'Аккаунт не найден.';end if;
 update lecture_private.reader_accounts set max_browsers=p_limit where id=p_id;
 if p_limit is not null then
  update lecture_private.reader_bindings set active=false where id in (select id from lecture_private.reader_bindings where account_id=p_id and active order by created_at,id offset p_limit);
  delete from lecture_private.reader_sessions where binding_id in (select id from lecture_private.reader_bindings where account_id=p_id and not active);
 end if;
end;$$;
create function lecture_private.admin_revoke_reader_binding(p_binding uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 perform 1 from lecture_private.reader_accounts where id=(select account_id from lecture_private.reader_bindings where id=p_binding) for update;
 update lecture_private.reader_bindings set active=false where id=p_binding;
 delete from lecture_private.reader_sessions where binding_id=p_binding;
end;$$;
revoke all on function lecture_private.admin_set_reader_limit(uuid,integer),lecture_private.admin_revoke_reader_binding(uuid) from public,anon;
grant execute on function lecture_private.admin_set_reader_limit(uuid,integer),lecture_private.admin_revoke_reader_binding(uuid) to authenticated;
create function public.admin_set_reader_limit(p_id uuid,p_limit integer default 1) returns void language sql security invoker set search_path='' as $$ select lecture_private.admin_set_reader_limit(p_id,p_limit) $$;
create function public.admin_revoke_reader_binding(p_binding uuid) returns void language sql security invoker set search_path='' as $$ select lecture_private.admin_revoke_reader_binding(p_binding) $$;
revoke all on function public.admin_set_reader_limit(uuid,integer),public.admin_revoke_reader_binding(uuid) from public,anon;
grant execute on function public.admin_set_reader_limit(uuid,integer),public.admin_revoke_reader_binding(uuid) to authenticated;
alter table lecture_private.reader_accounts drop column bound_user_id,drop column browser_hash,drop column bound_at,drop column last_seen,drop column last_ip,drop column last_browser;
create function lecture_private.admin_create_reader_account_v2(p_login text,p_password text,p_label text default '',p_limit integer default 1) returns uuid language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 account:=lecture_private.admin_create_reader_account(p_login,p_password,p_label);
 perform lecture_private.admin_set_reader_limit(account,p_limit);return account;
end;$$;
revoke all on function lecture_private.admin_create_reader_account_v2(text,text,text,integer) from public,anon;
grant execute on function lecture_private.admin_create_reader_account_v2(text,text,text,integer) to authenticated;
create function public.admin_create_reader_account_v2(p_login text,p_password text,p_label text default '',p_limit integer default 1) returns uuid language sql security invoker set search_path='' as $$select lecture_private.admin_create_reader_account_v2(p_login,p_password,p_label,p_limit)$$;
revoke all on function public.admin_create_reader_account_v2(text,text,text,integer) from public,anon;
grant execute on function public.admin_create_reader_account_v2(text,text,text,integer) to authenticated;
create or replace function public.admin_reset_visitors(p_confirmation text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 if p_confirmation not in ('','СБРОСИТЬ ПОСЕТИТЕЛЕЙ') or p_confirmation is null then raise exception 'Введите СБРОСИТЬ ПОСЕТИТЕЛЕЙ для подтверждения';end if;
 if p_confirmation<>'' then lock table public.profiles,public.devices,public.visitor_requests,public.visitor_admin_audit,lecture_private.reader_accounts in share row exclusive mode;end if;
 select jsonb_build_object('profiles',(select count(*) from public.profiles where not is_admin),'cards',(select count(distinct visitor_group) from public.devices),'requests',(select count(*) from public.visitor_requests),'events',(select count(*) from public.page_events),'snapshots',(select count(*) from public.device_snapshots),'ips',(select count(*) from public.device_ips),'bindings',(select count(*) from lecture_private.reader_bindings),'account_ips',(select count(*) from lecture_private.reader_binding_ips)) into result;
 if p_confirmation='' then return result||jsonb_build_object('reset',false);end if;
 delete from public.visitor_name_requirements;
 delete from public.visitor_requests;
 delete from public.device_presence_sessions;
 delete from public.page_events;
 delete from public.device_snapshots;
 delete from public.device_ips;
 delete from public.devices;
 delete from public.visitor_admin_audit;
 delete from lecture_private.reader_bindings;
 delete from lecture_private.reader_login_limits;
 update public.profiles set first_name='',last_name='',display_name='',blocked=false,access_state='unsubmitted',access_reason='',approved_at=null,last_seen=null,visitor_reset_at=clock_timestamp() where not is_admin;
 delete from public.user_notifications where user_id in (select id from public.profiles where not is_admin);
 return result||jsonb_build_object('reset',true);
end;$$;
commit;
