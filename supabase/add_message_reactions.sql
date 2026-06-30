-- One reaction per (message, user) — picking a new emoji replaces the old
-- one (matches base Telegram behavior, not the Slack/Discord multi-reaction
-- model). Toggle (same emoji again removes it) is handled client-side.
create table message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_reactions_message_idx on message_reactions (message_id);

alter table message_reactions enable row level security;

create policy "members can view reactions in their chats"
  on message_reactions for select using (
    exists (
      select 1 from messages msg
      join chat_members m on m.chat_id = msg.chat_id
      where msg.id = message_reactions.message_id and m.user_id = auth.uid()
    )
  );

create policy "members can react to messages in their chats"
  on message_reactions for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from messages msg
      join chat_members m on m.chat_id = msg.chat_id
      where msg.id = message_reactions.message_id and m.user_id = auth.uid()
    )
  );

create policy "members can change their own reaction"
  on message_reactions for update using (auth.uid() = user_id);

create policy "members can remove their own reaction"
  on message_reactions for delete using (auth.uid() = user_id);
