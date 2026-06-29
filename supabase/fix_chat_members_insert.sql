-- Bootstrap problem: when a chat is brand new, no chat_members rows exist yet,
-- so is_chat_admin() is always false for its creator — meaning the creator
-- couldn't add the very first members (themselves or others). Allow insert
-- when the current user is the chat's creator (per chats.created_by).
drop policy if exists "owners and admins can manage members" on chat_members;
create policy "owners and admins can manage members"
  on chat_members for insert with check (
    is_chat_admin(chat_id, auth.uid())
    or user_id = auth.uid()
    or exists (select 1 from chats c where c.id = chat_id and c.created_by = auth.uid())
  );
