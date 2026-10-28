create table public.visitor_name_requirements(user_id uuid primary key references auth.users(id) on delete cascade,requested_at timestamptz not null default now(),requested_by uuid references auth.users(id));
alter table public.visitor_name_requirements enable row level security;
revoke all on public.visitor_name_requirements from public,anon,authenticated;
create function public.admin_require_visitor_name(p_group uuid,p_required boolean default true) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 if exists(select 1 from public.devices d join public.profiles p on p.id=d.owner_id where d.visitor_group=p_group and p.is_admin) then raise exception 'admin_protected';end if;
 if p_required then
 insert into public.visitor_name_requirements(user_id,requested_by) select distinct d.owner_id,auth.uid() from public.devices d where d.visitor_group=p_group and d.owner_id is not null on conflict(user_id) do update set requested_at=now(),requested_by=excluded.requested_by;
 get diagnostics n=row_count;
 else delete from public.visitor_name_requirements where user_id in (select owner_id from public.devices where visitor_group=p_group);get diagnostics n=row_count; end if;
 if n=0 and p_required then raise exception 'visitor_not_found';end if;
 insert into public.visitor_admin_audit(actor,action,details) values(auth.uid(),'require_name',jsonb_build_object('group',p_group,'required',p_required,'sessions',n));return n;
end $$;
create function public.my_name_requirement() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.visitor_name_requirements where user_id=auth.uid()) $$;
create function public.submit_required_name(p_first_name text,p_last_name text) returns void language plpgsql security definer set search_path='' as $$
declare f text:=regexp_replace(trim(coalesce(p_first_name,'')),'[[:space:]]+',' ','g'); l text:=regexp_replace(trim(coalesce(p_last_name,'')),'[[:space:]]+',' ','g');begin
 if auth.uid() is null or not exists(select 1 from public.visitor_name_requirements where user_id=auth.uid()) then raise exception 'access_denied';end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and not blocked) or exists(select 1 from public.devices where owner_id=auth.uid() and blocked) then raise exception 'access_denied';end if;
 if length(f) not between 1 and 80 or length(l) not between 1 and 80 or f !~ '^[[:alpha:]][[:alpha:] ’''-]*$' or l !~ '^[[:alpha:]][[:alpha:] ’''-]*$' then raise exception 'Введите имя и фамилию буквами.';end if;
 update public.profiles set first_name=f,last_name=l where id=auth.uid();
 delete from public.visitor_name_requirements where user_id=auth.uid();
end $$;
revoke all on function public.admin_require_visitor_name(uuid,boolean),public.my_name_requirement(),public.submit_required_name(text,text) from public,anon;
grant execute on function public.admin_require_visitor_name(uuid,boolean),public.my_name_requirement(),public.submit_required_name(text,text) to authenticated;
create or replace function lecture_private.session_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and not p.blocked)
 and not exists(select 1 from public.devices d where d.owner_id=auth.uid() and d.blocked)
 and not exists(select 1 from public.visitor_name_requirements where user_id=auth.uid());
$$;
