alter table chats add column pinned_message_id uuid references messages(id) on delete set null;

-- Pin/unpin go through RPCs instead of a direct UPDATE policy on `chats`:
-- the existing "owners and admins can update chat" policy (title/avatar) is
-- intentionally restricted to owner/admin, but pinning should be allowed for
-- any chat member, including the non-creator side of a direct chat (who only
-- holds the 'member' role there). A second, more permissive UPDATE policy on
-- the same table would also loosen who can rename/re-avatar the chat, since
-- Postgres RLS can't scope a policy to one column — these SECURITY DEFINER
-- functions sidestep that by checking membership themselves and touching
-- only pinned_message_id.
create or replace function pin_message(p_chat_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from chat_members where chat_id = p_chat_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this chat';
  end if;

  if not exists (
    select 1 from messages where id = p_message_id and chat_id = p_chat_id
  ) then
    raise exception 'message does not belong to this chat';
  end if;

  update chats set pinned_message_id = p_message_id where id = p_chat_id;
end;
$$;

create or replace function unpin_message(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from chat_members where chat_id = p_chat_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this chat';
  end if;

  update chats set pinned_message_id = null where id = p_chat_id;
end;
$$;

grant execute on function pin_message(uuid, uuid) to authenticated;
grant execute on function unpin_message(uuid) to authenticated;
