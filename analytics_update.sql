-- Opens published material to non-blocked anonymous sessions; admin checks remain unchanged.
create or replace function lecture_private.is_active() returns boolean language sql stable security definer set search_path = '' as $$
 select lecture_private.session_allowed() and exists(select 1 from public.profiles p where p.id=auth.uid());
$$;

create or replace function public.record_navigation(p_device_id uuid,p_page text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not lecture_private.is_active() then raise exception 'access_denied'; end if;
 if p_page not in ('library','subjects','saved','reader','privacy') then raise exception 'invalid_page'; end if;
 if not exists(select 1 from public.devices where id=p_device_id and owner_id=auth.uid() and not blocked) then raise exception 'access_denied'; end if;
 if exists(select 1 from public.page_events where device_id=p_device_id and event='page_open' and payload->>'page'=p_page and created_at>now()-interval '5 seconds') then return; end if;
 insert into public.page_events(device_id,event,payload) values(p_device_id,'page_open',jsonb_build_object('page',p_page));
end $$;
revoke all on function public.record_navigation(uuid,text) from public, anon;
grant execute on function public.record_navigation(uuid,text) to authenticated;

create or replace function public.admin_analytics_v2(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare answer jsonb;
begin
 if not lecture_private.is_admin() then raise exception 'access_denied'; end if;
 if p_days not in (7,30,90) then raise exception 'invalid_range'; end if;
 select jsonb_build_object(
 'daily',coalesce((select jsonb_agg(x order by x.date_key) from (select (e.created_at at time zone 'Europe/Moscow')::date as date_key, count(*) filter(where e.event='lecture_view') views,count(distinct e.device_id) visitors,count(*) filter(where e.event='page_open') opens from public.page_events e where e.created_at>=now()-make_interval(days=>p_days) group by 1) x),'[]'::jsonb),
 'modes',coalesce((select jsonb_agg(x order by x.views desc) from (select coalesce(e.payload->>'mode','unknown') mode,count(*) views from public.page_events e where e.event='lecture_view' and e.created_at>=now()-make_interval(days=>p_days) group by 1) x),'[]'::jsonb),
 'pages',coalesce((select jsonb_agg(x order by x.opens desc) from (select left(coalesce(e.payload->>'page',''),100) page,count(*) opens from public.page_events e where e.event='page_open' and e.created_at>=now()-make_interval(days=>p_days) group by 1 order by 2 desc limit 10) x),'[]'::jsonb)
 ) into answer; return answer;
end $$;
revoke all on function public.admin_analytics_v2(integer) from public,anon;
grant execute on function public.admin_analytics_v2(integer) to authenticated;
