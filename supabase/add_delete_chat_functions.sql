-- Run in Supabase Dashboard → SQL Editor.

-- Deletes a direct chat for both participants.
-- Removing both chat_members rows triggers the realtime DELETE listener
-- in useChats, so the chat disappears from both users' lists immediately.
create or replace function delete_direct_chat_for_all(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from chats where id = p_chat_id and type = 'direct') then
    raise exception 'not a direct chat';
  end if;
  if not exists (
    select 1 from chat_members where chat_id = p_chat_id and user_id = auth.uid()
  ) then
    raise exception 'not a member';
  end if;
  delete from chat_members where chat_id = p_chat_id;
end;
$$;

-- Dissolves a group chat (owner only).
create or replace function delete_group_chat(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from chat_members
    where chat_id = p_chat_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'only owner can delete group';
  end if;
  delete from chat_members where chat_id = p_chat_id;
end;
$$;

grant execute on function delete_direct_chat_for_all(uuid) to authenticated;
grant execute on function delete_group_chat(uuid) to authenticated;
