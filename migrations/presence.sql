create table public.device_presence_sessions (
 id uuid primary key, device_id uuid not null references public.devices(id) on delete cascade,
 last_tick timestamptz not null default now(), visible boolean not null default false,
 started_at timestamptz not null default now()
);
create index device_presence_device on public.device_presence_sessions(device_id,last_tick desc);
alter table public.device_presence_sessions enable row level security;
revoke all on public.device_presence_sessions from anon,authenticated;
create function public.device_presence_tick(p_device_id uuid,p_session_id uuid,p_visible boolean) returns void language plpgsql security definer set search_path='' as $$
declare rec public.device_presence_sessions; delta integer:=0; now_at timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not lecture_private.is_active() then raise exception 'access_denied'; end if;
 if not exists(select 1 from public.devices where id=p_device_id and owner_id=auth.uid() and not blocked) then raise exception 'access_denied'; end if;
 insert into public.device_presence_sessions(id,device_id,last_tick,visible) values(p_session_id,p_device_id,now_at,false) on conflict(id) do nothing;
 select * into rec from public.device_presence_sessions where id=p_session_id and device_id=p_device_id for update;
 if not found then raise exception 'access_denied'; end if;
 now_at:=clock_timestamp();
 if rec.visible then delta:=least(30,greatest(0,floor(extract(epoch from now_at-rec.last_tick))::integer));end if;
 update public.device_presence_sessions set last_tick=now_at,visible=coalesce(p_visible,false) where id=p_session_id;
 if delta>0 then
  update public.devices set active_seconds=active_seconds+delta,last_seen=now_at where id=p_device_id;
  insert into public.page_events(device_id,event,payload) values(p_device_id,'heartbeat',jsonb_build_object('seconds',delta,'measurement','foreground'));
 else update public.devices set last_seen=now_at where id=p_device_id;end if;
end $$;
revoke all on function public.device_presence_tick(uuid,uuid,boolean) from public,anon;
grant execute on function public.device_presence_tick(uuid,uuid,boolean) to authenticated;

create function public.admin_presence_overview(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not lecture_private.is_admin() then raise exception 'access_denied';end if;
 if p_days not in (7,30,90) then raise exception 'invalid_range';end if;
 return jsonb_build_object(
  'online', (select count(distinct device_id) from public.device_presence_sessions where visible and last_tick>now()-interval '35 seconds'),
  'daily_seconds', coalesce((select jsonb_agg(to_jsonb(x) order by x.date_key desc) from (select (created_at at time zone 'Europe/Moscow')::date as date_key, sum(coalesce((payload->>'seconds')::integer,0)) seconds from public.page_events where event='heartbeat' and created_at>=now()-make_interval(days=>p_days) group by 1 order by 1 desc limit 14) x),'[]'::jsonb),
  'browsers', coalesce((select jsonb_agg(to_jsonb(x) order by x.qty desc) from (select coalesce(nullif(browser,''),'Неизвестно') name,count(*) as qty from public.device_snapshots where created_at>=now()-make_interval(days=>p_days) group by 1 order by 2 desc limit 8) x),'[]'::jsonb),
  'systems', coalesce((select jsonb_agg(to_jsonb(x) order by x.qty desc) from (select coalesce(nullif(os,''),'Неизвестно') name,count(*) as qty from public.device_snapshots where created_at>=now()-make_interval(days=>p_days) group by 1 order by 2 desc limit 8) x),'[]'::jsonb)
 );
end $$;
revoke all on function public.admin_presence_overview(integer) from public,anon;
grant execute on function public.admin_presence_overview(integer) to authenticated;
