-- "Delete for me" support: a per-user list of messages hidden from their own
-- view, independent of the shared `messages.deleted` flag (which is "delete
-- for everyone" and restricted by RLS to the sender).
create table message_hidden_for_user (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  chat_id uuid not null references chats(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_hidden_for_user_chat_idx on message_hidden_for_user (chat_id, user_id);

alter table message_hidden_for_user enable row level security;

create policy "users manage their own hidden-message list"
  on message_hidden_for_user for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
