begin;

create table if not exists lecture_private.reader_allowed_ips (
  ip inet primary key,
  check (masklen(ip) = case family(ip) when 4 then 32 else 128 end)
);
alter table lecture_private.reader_allowed_ips enable row level security;
revoke all on lecture_private.reader_allowed_ips from public, anon, authenticated;

create or replace function lecture_private.parse_reader_ip(p_ip text)
returns inet
language sql immutable set search_path = ''
as $$
  select case
    when p_ip ~ '^[0-9A-Fa-f:.]{2,45}$' and pg_input_is_valid(p_ip, 'inet')
    then p_ip::inet
  end;
$$;
revoke all on function lecture_private.parse_reader_ip(text) from public, anon, authenticated;

create or replace function lecture_private.reader_ip_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $$
  -- Supabase's gateway sets this header. Match only the address on this request.
  select exists (
    select 1
    from lecture_private.reader_allowed_ips
    where ip = lecture_private.parse_reader_ip(
      nullif(current_setting('request.headers', true), '')::jsonb->>'cf-connecting-ip'
    )
  );
$$;
revoke all on function lecture_private.reader_ip_allowed() from public, anon, authenticated;

create or replace function lecture_private.site_is_open()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select lecture_private.is_admin()
    or not coalesce((select paused from public.site_availability where id = 1), false)
    or lecture_private.reader_ip_allowed()
    or lecture_private.reader_can_bypass_pause();
$$;

create or replace function lecture_private.reader_pause_access()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select lecture_private.session_allowed()
    and (lecture_private.reader_ip_allowed() or lecture_private.reader_can_bypass_pause());
$$;

create or replace function public.site_status()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'paused', paused,
    'message', message,
    'revision', revision,
    'paused_at', paused_at,
    'ip_allowed', lecture_private.reader_ip_allowed()
  )
  from public.site_availability
  where id = 1;
$$;

create or replace function lecture_private.admin_reader_ips()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not lecture_private.is_admin() then
    raise insufficient_privilege using message = 'access_denied';
  end if;

  return coalesce(
    (select jsonb_agg(host(ip) order by ip) from lecture_private.reader_allowed_ips),
    '[]'::jsonb
  );
end;
$$;

create or replace function lecture_private.admin_set_reader_ip(p_ip text, p_allowed boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  address inet;
begin
  if not lecture_private.is_admin() then
    raise insufficient_privilege using message = 'access_denied';
  end if;

  address := lecture_private.parse_reader_ip(btrim(p_ip));
  if address is null or p_allowed is null then
    raise invalid_parameter_value using message = 'invalid_ip';
  end if;

  if p_allowed then
    insert into lecture_private.reader_allowed_ips(ip) values (address) on conflict do nothing;
  else
    delete from lecture_private.reader_allowed_ips where ip = address;
  end if;

  return lecture_private.admin_reader_ips();
end;
$$;

create or replace function public.admin_reader_ips()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select lecture_private.admin_reader_ips();
$$;

create or replace function public.admin_set_reader_ip(p_ip text, p_allowed boolean)
returns jsonb
language sql security invoker set search_path = ''
as $$
  select lecture_private.admin_set_reader_ip(p_ip, p_allowed);
$$;

revoke all on function lecture_private.admin_reader_ips(), lecture_private.admin_set_reader_ip(text, boolean) from public, anon;
revoke all on function public.admin_reader_ips(), public.admin_set_reader_ip(text, boolean) from public, anon;
grant execute on function lecture_private.admin_reader_ips(), lecture_private.admin_set_reader_ip(text, boolean) to authenticated;
grant execute on function public.admin_reader_ips(), public.admin_set_reader_ip(text, boolean) to authenticated;

commit;
