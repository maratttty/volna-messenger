-- Multiple pinned messages per chat.
-- Run this in Supabase Dashboard → SQL Editor.

-- 1. New table: one row per pinned message per chat
create table if not exists pinned_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references chats(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  pinned_by  uuid references auth.users(id),
  pinned_at  timestamptz not null default now(),
  unique(chat_id, message_id)
);

alter table pinned_messages enable row level security;

-- 2. Any chat member can read pinned messages
create policy "members can view pinned messages"
  on pinned_messages for select
  using (
    exists (
      select 1 from chat_members
      where chat_id = pinned_messages.chat_id
        and user_id = auth.uid()
    )
  );

-- 3. Pin function (any member can pin)
create or replace function pin_message_multi(p_chat_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
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

  insert into pinned_messages (chat_id, message_id, pinned_by)
  values (p_chat_id, p_message_id, auth.uid())
  on conflict (chat_id, message_id) do nothing;
end;
$$;

-- 4. Unpin function (any member can unpin)
create or replace function unpin_message_multi(p_chat_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from chat_members where chat_id = p_chat_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this chat';
  end if;

  delete from pinned_messages where chat_id = p_chat_id and message_id = p_message_id;
end;
$$;

grant execute on function pin_message_multi(uuid, uuid) to authenticated;
grant execute on function unpin_message_multi(uuid, uuid) to authenticated;

-- 5. Migrate existing pinned messages from the old single-column schema
insert into pinned_messages (chat_id, message_id, pinned_by, pinned_at)
select id, pinned_message_id, created_by, now()
from chats
where pinned_message_id is not null
on conflict do nothing;

-- 6. Enable realtime for the new table
alter publication supabase_realtime add table pinned_messages;
