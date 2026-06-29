-- Without this, postgres_changes subscriptions never fire — RLS controls who
-- can read data, but Realtime additionally requires the table to be in the
-- supabase_realtime publication before any change events are broadcast at all.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table chat_members;
alter publication supabase_realtime add table message_status;
alter publication supabase_realtime add table chats;
