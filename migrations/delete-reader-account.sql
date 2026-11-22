create function public.admin_delete_reader_account(p_id uuid,p_login text) returns void
language plpgsql security definer set search_path='' as $$
declare nick text; grp record; successor text;
begin
 if not coalesce(lecture_private.is_admin(),false) then raise exception 'access_denied'; end if;
 perform 1 from lecture_private.reader_accounts where id=p_id and login=p_login for update;
 if not found then raise exception 'account_confirmation_failed'; end if;
 select handle into nick from lecture_private.chat_members where account_id=p_id for update;
 for grp in select id from lecture_private.chat_groups where owner_handle=nick order by id for update loop
   select handle into successor from lecture_private.chat_roster where group_id=grp.id and handle<>nick and not banned order by is_admin desc,handle limit 1;
   if successor is null then delete from lecture_private.chat_groups where id=grp.id;
   else update lecture_private.chat_groups set owner_handle=successor where id=grp.id; end if;
 end loop;
 delete from lecture_private.chat_posts where sender=nick or recipient=nick;
 delete from lecture_private.chat_roster where handle=nick;
 delete from lecture_private.chat_bindings where handle=nick;
 delete from lecture_private.chat_members where account_id=p_id;
 delete from lecture_private.reader_accounts where id=p_id;
end $$;
revoke all on function public.admin_delete_reader_account(uuid,text) from public,anon;
grant execute on function public.admin_delete_reader_account(uuid,text) to authenticated;
