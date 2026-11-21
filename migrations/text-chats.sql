-- Text-only chats. Only the guarded RPCs have access to these private tables.
create table lecture_private.chat_members (
  handle text primary key check (handle ~ '^[a-z][a-z0-9_]{2,19}$'),
  recovery_hash bytea not null,
  registration_ip inet,
  created_at timestamptz not null default now()
);
create table lecture_private.chat_bindings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null references lecture_private.chat_members
);
create table lecture_private.chat_posts (
  id bigint generated always as identity primary key,
  sender text not null references lecture_private.chat_members,
  recipient text references lecture_private.chat_members,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  sent_at timestamptz not null default clock_timestamp(),
  nonce uuid not null,
  unique(sender, nonce),
  check (recipient is distinct from sender)
);
create index chat_global_page on lecture_private.chat_posts(id desc) where recipient is null;
create index chat_outbox on lecture_private.chat_posts(sender,recipient,id desc);
create index chat_inbox on lecture_private.chat_posts(recipient,sender,id desc);
alter table lecture_private.chat_members enable row level security;
alter table lecture_private.chat_bindings enable row level security;
alter table lecture_private.chat_posts enable row level security;
revoke all on lecture_private.chat_members,lecture_private.chat_bindings,lecture_private.chat_posts from public,anon,authenticated;

create function lecture_private.chat_handle() returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not lecture_private.session_allowed() then
    raise insufficient_privilege using message='access_denied';
  end if;
  return (select handle from lecture_private.chat_bindings where user_id=auth.uid());
end $$;

create function lecture_private.chat_join(p_handle text,p_code text,p_restore boolean) returns text
language plpgsql security definer set search_path='' as $$
declare
  name text:=lower(btrim(p_handle));
  current_name text;
  hash bytea;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 41));
  current_name:=lecture_private.chat_handle();
  if current_name is not null then
    if current_name=name then return current_name; end if;
    raise exception 'handle_fixed';
  end if;
  if name is null or name !~ '^[a-z][a-z0-9_]{2,19}$' then raise exception 'invalid_handle'; end if;
  if p_code is null or p_code !~ '^[a-f0-9]{32}$' then raise exception 'invalid_code'; end if;
  hash:=extensions.digest(p_code,'sha256');
  if p_restore then
    if not exists(select 1 from lecture_private.chat_members m where m.handle=name and m.recovery_hash=hash) then
      raise exception 'invalid_code';
    end if;
  else
    insert into lecture_private.chat_members(handle,recovery_hash,registration_ip)
    values(name,hash,lecture_private.parse_reader_ip(nullif(current_setting('request.headers',true),'')::jsonb->>'cf-connecting-ip'))
    on conflict do nothing;
    if not found then raise exception 'handle_taken'; end if;
  end if;
  insert into lecture_private.chat_bindings values(auth.uid(),name);
  return name;
end $$;

create function lecture_private.chat_peer(p_peer text,me text) returns void
language plpgsql stable set search_path='' as $$
begin
  if me is null then raise exception 'join_first'; end if;
  if p_peer=me then raise exception 'self_chat'; end if;
  if p_peer is not null and not exists(select 1 from lecture_private.chat_members where handle=p_peer) then
    raise exception 'unknown_peer';
  end if;
end $$;

create function lecture_private.chat_feed(p_peer text,p_before bigint,p_after bigint)
returns table(id bigint,sender text,body text,sent_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle();
begin
  perform lecture_private.chat_peer(p_peer,me);
  return query select m.id,m.sender,m.body,m.sent_at from lecture_private.chat_posts m
    where ((p_peer is null and m.recipient is null) or
           (p_peer is not null and ((m.sender=me and m.recipient=p_peer) or (m.sender=p_peer and m.recipient=me))))
      and (p_before is null or m.id<p_before) and (p_after is null or m.id>p_after)
    order by case when p_after is not null then m.id end asc,m.id desc limit 50;
end $$;

create function lecture_private.chat_threads()
returns table(peer text,preview text,sent_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle();
begin
  if me is null then raise exception 'join_first'; end if;
  return query select t.other,left(t.body,90),t.sent_at from (
    select distinct on (p.other) p.* from (
      select m.recipient as other,m.body,m.sent_at,m.id from lecture_private.chat_posts m where m.sender=me and m.recipient is not null
      union all
      select m.sender,m.body,m.sent_at,m.id from lecture_private.chat_posts m where m.recipient=me
    ) p order by p.other,p.id desc
  ) t order by t.id desc;
end $$;

create function lecture_private.chat_send(p_peer text,p_body text,p_nonce uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare me text:=lecture_private.chat_handle(); post_id bigint;
begin
  perform lecture_private.chat_peer(p_peer,me);
  if p_body is null or char_length(p_body) not between 1 and 2000 or p_body !~ '[^[:space:]]' or p_nonce is null then
    raise exception 'invalid_message';
  end if;
  perform 1 from lecture_private.chat_members where handle=me for update;
  select id into post_id from lecture_private.chat_posts where sender=me and nonce=p_nonce;
  if found then return post_id; end if;
  if (select count(*) from lecture_private.chat_posts where sender=me and sent_at>clock_timestamp()-interval '30 seconds')>=15 then
    raise exception 'slow_down';
  end if;
  -- Assign IDs in commit order within one conversation, for reliable cursor polling.
  perform pg_advisory_xact_lock(hashtextextended(case when p_peer is null then 'global' else least(me,p_peer)||':'||greatest(me,p_peer) end,42));
  insert into lecture_private.chat_posts(sender,recipient,body,nonce) values(me,p_peer,btrim(p_body),p_nonce) returning id into post_id;
  return post_id;
end $$;
create index chat_sender_time on lecture_private.chat_posts(sender,sent_at desc);

create function public.chat_handle() returns text language sql stable security invoker set search_path='' as $$ select lecture_private.chat_handle() $$;
create function public.chat_join(p_handle text,p_code text,p_restore boolean) returns text language sql security invoker set search_path='' as $$ select lecture_private.chat_join(p_handle,p_code,p_restore) $$;
create function public.chat_feed(p_peer text default null,p_before bigint default null,p_after bigint default null)
returns table(id bigint,sender text,body text,sent_at timestamptz) language sql stable security invoker set search_path='' as $$ select * from lecture_private.chat_feed(p_peer,p_before,p_after) $$;
create function public.chat_threads() returns table(peer text,preview text,sent_at timestamptz) language sql stable security invoker set search_path='' as $$ select * from lecture_private.chat_threads() $$;
create function public.chat_send(p_peer text,p_body text,p_nonce uuid) returns bigint language sql security invoker set search_path='' as $$ select lecture_private.chat_send(p_peer,p_body,p_nonce) $$;

revoke all on function lecture_private.chat_peer(text,text) from public,anon,authenticated;
do $$
declare s text; f text;
begin
  foreach s in array array['lecture_private','public'] loop
    foreach f in array array['chat_handle()','chat_join(text,text,boolean)','chat_feed(text,bigint,bigint)','chat_threads()','chat_send(text,text,uuid)'] loop
      execute format('revoke all on function %I.%s from public,anon,authenticated',s,f);
      execute format('grant execute on function %I.%s to authenticated',s,f);
    end loop;
  end loop;
end $$;
