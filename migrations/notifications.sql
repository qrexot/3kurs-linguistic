create table public.user_notifications (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null,
 title text not null,
 body text not null default '',
 target text,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index user_notifications_inbox on public.user_notifications(user_id,created_at desc,id desc);
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon,authenticated;

create function public.my_notifications() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'access_denied'; end if;
 select jsonb_build_object('unread',(select count(*) from public.user_notifications n where n.user_id=auth.uid() and n.read_at is null),'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select id,kind,title,body,target,created_at,read_at from public.user_notifications where user_id=auth.uid() order by id desc limit 50) x),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.mark_notifications_read(p_id bigint default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'access_denied'; end if;
 update public.user_notifications set read_at=coalesce(read_at,now()) where user_id=auth.uid() and (p_id is null or id=p_id) and read_at is null;
end $$;
revoke all on function public.my_notifications(),public.mark_notifications_read(bigint) from public,anon;
grant execute on function public.my_notifications(),public.mark_notifications_read(bigint) to authenticated;

create function lecture_private.notify_site_block() returns trigger language plpgsql security definer set search_path='' as $$
declare reason text:=nullif(current_setting('app.moderation_reason',true),''); begin
 if new.blocked is distinct from old.blocked then
 insert into public.user_notifications(user_id,kind,title,body,target) values(new.id,'site_moderation',case when new.blocked then 'Доступ к сайту ограничен' else 'Доступ к сайту восстановлен' end,case when new.blocked then 'Владелец ограничил доступ к сайту.' else 'Ограничение доступа снято.' end || case when reason is not null then ' Причина: '||left(reason,300) else '' end,null);
 end if; return new;
end $$;
create trigger site_block_notification after update of blocked on public.profiles for each row execute function lecture_private.notify_site_block();
