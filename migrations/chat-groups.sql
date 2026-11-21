alter table lecture_private.chat_members
  add column avatar_id smallint check (avatar_id between 1 and 9),
  add column chat_banned boolean not null default false,
  add column muted_until timestamptz;

create table lecture_private.chat_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 64 and title ~ '[^[:space:]]'),
  owner_handle text not null references lecture_private.chat_members,
  created_at timestamptz not null default now()
);
create table lecture_private.chat_roster (
  group_id uuid not null references lecture_private.chat_groups on delete cascade,
  handle text not null references lecture_private.chat_members,
  is_admin boolean not null default false,
  banned boolean not null default false,
  muted_until timestamptz,
  primary key(group_id,handle)
);
create index chat_roster_handle on lecture_private.chat_roster(handle);
alter table lecture_private.chat_groups enable row level security;
alter table lecture_private.chat_roster enable row level security;
revoke all on lecture_private.chat_groups,lecture_private.chat_roster from public,anon,authenticated;
alter table lecture_private.chat_posts add column group_id uuid references lecture_private.chat_groups on delete cascade,
  add check (group_id is null or recipient is null);
create index chat_group_page on lecture_private.chat_posts(group_id,id desc) where group_id is not null;

create or replace function lecture_private.chat_handle() returns text
language plpgsql stable security definer set search_path='' as $$
declare profile lecture_private.chat_members;
begin
  if auth.uid() is null or not lecture_private.session_allowed() then raise exception 'access_denied'; end if;
  select m.* into profile from lecture_private.chat_members m join lecture_private.chat_bindings b using(handle) where b.user_id=auth.uid();
  if profile.chat_banned then raise exception 'chat_banned'; end if;
  return profile.handle;
end $$;

create function lecture_private.chat_group_id(p_peer text) returns uuid language sql immutable set search_path='' as $$
  select case when p_peer ~ '^~[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then substr(p_peer,2)::uuid end
$$;
create or replace function lecture_private.chat_peer(p_peer text, me text) returns void
language plpgsql stable set search_path='' as $$
begin
  if me is null then raise exception 'join_first'; end if;
  if p_peer=me then raise exception 'self_chat'; end if;
  if left(p_peer,1)='~' then
    if not exists(select from lecture_private.chat_roster where group_id=lecture_private.chat_group_id(p_peer) and handle=me and not banned) then raise exception 'group_unavailable'; end if;
  elsif p_peer is not null and not exists(select from lecture_private.chat_members where handle=p_peer) then raise exception 'unknown_peer';
  end if;
end $$;
create or replace function lecture_private.chat_feed(p_peer text,p_before bigint,p_after bigint)
returns table(id bigint,sender text,body text,sent_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle(); gid uuid:=lecture_private.chat_group_id(p_peer);
begin
  perform lecture_private.chat_peer(p_peer,me);
  return query select m.id,m.sender,m.body,m.sent_at from lecture_private.chat_posts m
    where ((gid is not null and m.group_id=gid) or
      (m.group_id is null and ((p_peer is null and m.recipient is null) or
       (p_peer is not null and ((m.sender=me and m.recipient=p_peer) or (m.sender=p_peer and m.recipient=me))))))
      and (p_before is null or m.id<p_before) and (p_after is null or m.id>p_after)
    order by case when p_after is not null then m.id end asc,m.id desc limit 50;
end $$;
create or replace function lecture_private.chat_send(p_peer text,p_body text,p_nonce uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle(); gid uuid:=lecture_private.chat_group_id(p_peer); member lecture_private.chat_members; post_id bigint;
begin
  select * into member from lecture_private.chat_members where handle=me for update;
  if member.chat_banned then raise exception 'chat_banned'; end if;
  if member.muted_until>clock_timestamp() then raise exception 'chat_muted'; end if;
  if gid is not null then perform 1 from lecture_private.chat_groups where id=gid for update; end if;
  perform lecture_private.chat_peer(p_peer,me);
  if exists(select from lecture_private.chat_roster where group_id=gid and handle=me and muted_until>clock_timestamp()) then raise exception 'group_muted'; end if;
  if p_body is null or char_length(p_body) not between 1 and 2000 or p_body !~ '[^[:space:]]' or p_nonce is null then raise exception 'invalid_message'; end if;
  select id into post_id from lecture_private.chat_posts where sender=me and nonce=p_nonce;
  if found then return post_id; end if;
  if (select count(*) from lecture_private.chat_posts where sender=me and sent_at>clock_timestamp()-interval '30 seconds')>=15 then raise exception 'slow_down'; end if;
  if gid is null then perform pg_advisory_xact_lock(hashtextextended(case when p_peer is null then 'global' else least(me,p_peer)||':'||greatest(me,p_peer) end,42)); end if;
  insert into lecture_private.chat_posts(sender,recipient,group_id,body,nonce)
    values(me,case when gid is null then p_peer end,gid,btrim(p_body),p_nonce) returning id into post_id;
  return post_id;
end $$;

create function lecture_private.chat_groups_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle();
begin
  if me is null then raise exception 'join_first'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key','~'||g.id,'title',g.title,'role',case when g.owner_handle=me then 'owner' when r.is_admin then 'admin' else 'member' end,'muted_until',r.muted_until,'preview',left(p.body,90)) order by coalesce(p.sent_at,g.created_at) desc,g.id)
  from lecture_private.chat_roster r join lecture_private.chat_groups g on g.id=r.group_id
  left join lateral (select m.body,m.sent_at from lecture_private.chat_posts m where m.group_id=g.id order by m.id desc limit 1) p on true
  where r.handle=me and not r.banned),'[]'::jsonb);
end $$;

create function lecture_private.chat_group_create(p_title text) returns text language plpgsql security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle(); gid uuid;
begin
  if me is null then raise exception 'join_first'; end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 64 or p_title !~ '[^[:space:]]' then raise exception 'invalid_title'; end if;
  insert into lecture_private.chat_groups(title,owner_handle) values(trim(p_title),me) returning id into gid;
  insert into lecture_private.chat_roster(group_id,handle) values(gid,me);
  return '~'||gid;
end $$;

create function lecture_private.chat_group_people(p_peer text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle(); gid uuid:=lecture_private.chat_group_id(p_peer); manager boolean;
begin
  perform lecture_private.chat_peer(p_peer,me);
  select r.is_admin or g.owner_handle=me into manager from lecture_private.chat_roster r join lecture_private.chat_groups g on g.id=r.group_id where r.handle=me and g.id=gid;
  return coalesce((select jsonb_agg(jsonb_build_object('handle',r.handle,'role',case when g.owner_handle=r.handle then 'owner' when r.is_admin then 'admin' else 'member' end,'banned',r.banned,'muted_until',r.muted_until,'avatar',m.avatar_id) order by r.banned,(g.owner_handle=r.handle) desc,r.is_admin desc,r.handle)
    from lecture_private.chat_roster r join lecture_private.chat_groups g on g.id=r.group_id join lecture_private.chat_members m on m.handle=r.handle where g.id=gid and (manager or not r.banned)),'[]'::jsonb);
end $$;

create function lecture_private.chat_group_change(p_peer text,p_action text,p_target text,p_minutes integer) returns void
language plpgsql security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle(); gid uuid:=lecture_private.chat_group_id(p_peer); owner_name text; mine lecture_private.chat_roster; target_row lecture_private.chat_roster; who text:=lower(trim(p_target));
begin
  select owner_handle into owner_name from lecture_private.chat_groups where id=gid for update;
  select * into mine from lecture_private.chat_roster where group_id=gid and handle=me;
  if mine.handle is null or mine.banned then raise exception 'group_unavailable'; end if;
  if p_action='leave' and me<>owner_name then delete from lecture_private.chat_roster where group_id=gid and handle=me; return; end if;
  if p_action='delete' and me=owner_name then delete from lecture_private.chat_groups where id=gid; return; end if;
  if me<>owner_name and not mine.is_admin then raise exception 'group_forbidden'; end if;
  if who is null or who=me or who=owner_name then raise exception 'group_forbidden'; end if;
  if not exists(select from lecture_private.chat_members where handle=who) then raise exception 'unknown_peer'; end if;
  select * into target_row from lecture_private.chat_roster where group_id=gid and handle=who;
  if target_row.is_admin and me<>owner_name then raise exception 'group_forbidden'; end if;
  if p_action='add' then
    if target_row.banned then raise exception 'member_banned'; end if;
    insert into lecture_private.chat_roster(group_id,handle) values(gid,who) on conflict do nothing;
  elsif target_row.handle is null then raise exception 'unknown_member';
  elsif p_action='unban' and target_row.banned then delete from lecture_private.chat_roster where group_id=gid and handle=who;
  elsif target_row.banned then raise exception 'member_banned';
  elsif p_action='kick' then delete from lecture_private.chat_roster where group_id=gid and handle=who;
  elsif p_action='ban' then update lecture_private.chat_roster set banned=true,is_admin=false,muted_until=null where group_id=gid and handle=who;
  elsif p_action in ('promote','demote') and me=owner_name then update lecture_private.chat_roster set is_admin=(p_action='promote') where group_id=gid and handle=who;
  elsif p_action='unmute' then update lecture_private.chat_roster set muted_until=null where group_id=gid and handle=who;
  elsif p_action='mute' and p_minutes between 1 and 10080 then update lecture_private.chat_roster set muted_until=clock_timestamp()+make_interval(mins=>p_minutes) where group_id=gid and handle=who;
  else raise exception 'group_forbidden'; end if;
end $$;

create function lecture_private.chat_avatars(p_handles text[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if lecture_private.chat_handle() is null then raise exception 'join_first'; end if;
  if cardinality(p_handles)>500 then raise exception 'too_many_handles'; end if;
  return coalesce((select jsonb_object_agg(handle,avatar_id) from lecture_private.chat_members where handle=any(p_handles)),'{}'::jsonb);
end $$;
create function lecture_private.chat_set_avatar(p_avatar integer) returns void language plpgsql security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle();
begin
  if me is null then raise exception 'join_first'; end if;
  if p_avatar is null or p_avatar not between 1 and 9 then raise exception 'invalid_avatar'; end if;
  update lecture_private.chat_members set avatar_id=p_avatar where handle=me;
end $$;
create function lecture_private.admin_chat_restrict(p_target text,p_action text,p_minutes integer) returns void language plpgsql security definer set search_path='' as $$
declare who text:=lower(trim(p_target));
begin
  if not coalesce(lecture_private.is_admin(),false) then raise exception 'access_denied'; end if;
  if p_action='ban' then update lecture_private.chat_members set chat_banned=true where handle=who;
  elsif p_action='clear' then update lecture_private.chat_members set chat_banned=false,muted_until=null where handle=who;
  elsif p_action='mute' and p_minutes between 1 and 10080 then update lecture_private.chat_members set muted_until=clock_timestamp()+make_interval(mins=>p_minutes) where handle=who;
  else raise exception 'invalid_action'; end if;
  if not found then raise exception 'unknown_peer'; end if;
end $$;

create function public.chat_groups_list() returns jsonb
language sql stable security invoker set search_path='' as $$ select lecture_private.chat_groups_list() $$;
revoke all on function public.chat_groups_list(), lecture_private.chat_groups_list() from public,anon,authenticated;
grant execute on function public.chat_groups_list(), lecture_private.chat_groups_list() to authenticated;

create function public.chat_group_create(p_title text) returns text
language sql security invoker set search_path='' as $$ select lecture_private.chat_group_create(p_title) $$;
revoke all on function public.chat_group_create(text), lecture_private.chat_group_create(text) from public,anon,authenticated;
grant execute on function public.chat_group_create(text), lecture_private.chat_group_create(text) to authenticated;

create function public.chat_group_people(p_peer text) returns jsonb
language sql stable security invoker set search_path='' as $$ select lecture_private.chat_group_people(p_peer) $$;
revoke all on function public.chat_group_people(text), lecture_private.chat_group_people(text) from public,anon,authenticated;
grant execute on function public.chat_group_people(text), lecture_private.chat_group_people(text) to authenticated;

create function public.chat_group_change(p_peer text, p_action text, p_target text, p_minutes integer) returns void
language sql security invoker set search_path='' as $$ select lecture_private.chat_group_change(p_peer, p_action, p_target, p_minutes) $$;
revoke all on function public.chat_group_change(text, text, text, integer), lecture_private.chat_group_change(text, text, text, integer) from public,anon,authenticated;
grant execute on function public.chat_group_change(text, text, text, integer), lecture_private.chat_group_change(text, text, text, integer) to authenticated;

create function public.chat_avatars(p_handles text[]) returns jsonb
language sql stable security invoker set search_path='' as $$ select lecture_private.chat_avatars(p_handles) $$;
revoke all on function public.chat_avatars(text[]), lecture_private.chat_avatars(text[]) from public,anon,authenticated;
grant execute on function public.chat_avatars(text[]), lecture_private.chat_avatars(text[]) to authenticated;

create function public.chat_set_avatar(p_avatar integer) returns void
language sql security invoker set search_path='' as $$ select lecture_private.chat_set_avatar(p_avatar) $$;
revoke all on function public.chat_set_avatar(integer), lecture_private.chat_set_avatar(integer) from public,anon,authenticated;
grant execute on function public.chat_set_avatar(integer), lecture_private.chat_set_avatar(integer) to authenticated;

create function public.admin_chat_restrict(p_target text, p_action text, p_minutes integer) returns void
language sql security invoker set search_path='' as $$ select lecture_private.admin_chat_restrict(p_target, p_action, p_minutes) $$;
revoke all on function public.admin_chat_restrict(text, text, integer), lecture_private.admin_chat_restrict(text, text, integer) from public,anon,authenticated;
grant execute on function public.admin_chat_restrict(text, text, integer), lecture_private.admin_chat_restrict(text, text, integer) to authenticated;
revoke all on function lecture_private.chat_group_id(text) from public,anon,authenticated;
