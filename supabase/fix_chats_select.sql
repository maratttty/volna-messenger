-- Allow the creator to see a chat immediately after creating it, before the
-- chat_members row for them exists (we insert chats then chat_members as two
-- separate statements, and Supabase's INSERT...RETURNING requires the SELECT
-- policy to pass for the returned row).
drop policy if exists "members can read their chats" on chats;
create policy "members can read their chats"
  on chats for select using (
    is_chat_member(id, auth.uid()) or created_by = auth.uid()
  );
