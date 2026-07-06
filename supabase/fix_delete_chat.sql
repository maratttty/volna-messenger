-- Run in Supabase Dashboard → SQL Editor.
-- Fixes two chat deletion bugs:
-- 1. "Delete for all" not delivered to other participant in real-time
-- 2. "Delete for me" chat returns after reload

-- ── Soft-delete columns ───────────────────────────────────────────────────────
-- hidden_at: hides chat from list (filters in fetchChats)
-- hidden_before_at: hides messages older than this timestamp when chat reappears
alter table chat_members
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_before_at timestamptz;

-- ── Trigger: restore chat when other user sends a new message ─────────────────
-- Clears hidden_at so the chat reappears with only new messages visible.
create or replace function clear_chat_hidden_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update chat_members
  set hidden_at = null
  where chat_id = new.chat_id
    and user_id != new.sender_id
    and hidden_at is not null;
  return new;
end;
$$;

drop trigger if exists messages_clear_chat_hidden on messages;
create trigger messages_clear_chat_hidden
  after insert on messages
  for each row execute function clear_chat_hidden_on_message();

-- ── RLS SELECT policy fix for Realtime DELETE event delivery ──────────────────
-- Old policy used is_chat_member() which queries the live table — after both
-- rows are deleted, it returns false and Supabase can't deliver the event.
-- New policy uses auth.uid() = user_id (evaluated against the OLD row's data),
-- so DELETE events are delivered even after the row is gone.
drop policy if exists "members can see member list of their chats" on chat_members;
create policy "members can see member list of their chats"
  on chat_members for select using (
    auth.uid() = user_id
    or is_chat_member(chat_id, auth.uid())
  );
