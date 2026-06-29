-- Volna messenger — Postgres schema for Supabase
-- Run via Supabase SQL editor or `supabase db push`. RLS policies enforce
-- "users see only their own data" at the database level (per the spec's
-- requirement that authorization is checked server-side, not just in the UI).

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- Profiles (1:1 with auth.users, Supabase keeps auth separate from app data)
-- ─────────────────────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  last_seen_at timestamptz default now(),
  privacy jsonb not null default '{"online": "everyone", "avatar": "everyone"}',
  created_at timestamptz not null default now()
);

create index profiles_username_idx on profiles (lower(username));

-- ─────────────────────────────────────────────────────────────────────────────
-- Contacts
-- ─────────────────────────────────────────────────────────────────────────────
create table contacts (
  user_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Chats & membership
-- ─────────────────────────────────────────────────────────────────────────────
create type chat_type as enum ('direct', 'group');
create type member_role as enum ('owner', 'admin', 'member');

create table chats (
  id uuid primary key default uuid_generate_v4(),
  type chat_type not null,
  title text,
  avatar_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table chat_members (
  chat_id uuid not null references chats(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  muted boolean not null default false,
  last_read_message_id uuid,
  primary key (chat_id, user_id)
);

create index chat_members_user_idx on chat_members (user_id);

create table invites (
  id uuid primary key default uuid_generate_v4(),
  chat_id uuid not null references chats(id) on delete cascade,
  token text unique not null,
  created_by uuid references profiles(id),
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Messages
-- ─────────────────────────────────────────────────────────────────────────────
create type message_type as enum ('text', 'image', 'file', 'system');

create table messages (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid, -- echoed back so the client can dedupe its own optimistic sends
  chat_id uuid not null references chats(id) on delete cascade,
  sender_id uuid references profiles(id),
  type message_type not null default 'text',
  content text,
  attachment_url text,
  attachment_meta jsonb,
  reply_to_id uuid references messages(id),
  forwarded_from_id uuid references profiles(id) on delete set null, -- original sender, for "Forwarded from X"
  forwarded_from_name text, -- snapshot of the original sender's display name at forward time
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted boolean not null default false
);

-- One row per (message, recipient): tracks delivered/read independently per user
create table message_status (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('delivered', 'read')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index messages_chat_created_idx on messages (chat_id, created_at desc);
create unique index messages_chat_client_idx on messages (chat_id, sender_id, client_id)
  where client_id is not null; -- enforces idempotent sends (spec 5.7)

-- Full-text search over message bodies (spec 5.9 "search inside chat")
alter table messages add column search_vector tsvector
  generated always as (to_tsvector('russian', coalesce(content, ''))) stored;
create index messages_search_idx on messages using gin (search_vector);

-- ─────────────────────────────────────────────────────────────────────────────
-- Stories (24h ephemeral posts — offered free to everyone, unlike Telegram
-- where some story features are Premium-gated)
-- ─────────────────────────────────────────────────────────────────────────────
create table stories (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid not null references profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index stories_author_idx on stories (author_id, created_at desc);
create index stories_expiry_idx on stories (expires_at);

create table story_views (
  story_id uuid not null references stories(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sessions are managed by Supabase Auth itself; nothing to model here.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — every table is locked down by default; policies below
-- grant exactly the access the spec calls for ("user sees only own chats",
-- "rights checked server-side").
-- ─────────────────────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table contacts enable row level security;
alter table chats enable row level security;
alter table chat_members enable row level security;
alter table invites enable row level security;
alter table messages enable row level security;
alter table message_status enable row level security;
alter table stories enable row level security;
alter table story_views enable row level security;

-- Profiles: anyone authenticated can look up by username (for search), but
-- only the owner can edit their own row.
create policy "profiles are readable by authenticated users"
  on profiles for select using (auth.role() = 'authenticated');
create policy "users can update their own profile"
  on profiles for update using (auth.uid() = id);
create policy "users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

-- Contacts: only visible/editable by the owning user.
create policy "users manage their own contacts"
  on contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chats: visible only to members.
create policy "members can read their chats"
  on chats for select using (
    exists (select 1 from chat_members m where m.chat_id = chats.id and m.user_id = auth.uid())
  );
create policy "authenticated users can create chats"
  on chats for insert with check (auth.uid() = created_by);
create policy "owners and admins can update chat"
  on chats for update using (
    exists (select 1 from chat_members m where m.chat_id = chats.id and m.user_id = auth.uid()
            and m.role in ('owner', 'admin'))
  );

-- Chat members: visible to other members of the same chat; row owner can leave.
create policy "members can see member list of their chats"
  on chat_members for select using (
    exists (select 1 from chat_members m where m.chat_id = chat_members.chat_id and m.user_id = auth.uid())
  );
create policy "owners and admins can manage members"
  on chat_members for insert with check (
    exists (select 1 from chat_members m where m.chat_id = chat_members.chat_id and m.user_id = auth.uid()
            and m.role in ('owner', 'admin'))
    or chat_members.user_id = auth.uid() -- joining via invite
  );
create policy "members can update their own membership row"
  on chat_members for update using (auth.uid() = user_id or
    exists (select 1 from chat_members m where m.chat_id = chat_members.chat_id and m.user_id = auth.uid()
            and m.role in ('owner', 'admin')));
create policy "members can leave or be removed by admins"
  on chat_members for delete using (
    auth.uid() = user_id
    or exists (select 1 from chat_members m where m.chat_id = chat_members.chat_id and m.user_id = auth.uid()
               and m.role in ('owner', 'admin'))
  );

-- Invites: members can create/view; revocation limited to owner/admin.
create policy "members can view invites for their chats"
  on invites for select using (
    exists (select 1 from chat_members m where m.chat_id = invites.chat_id and m.user_id = auth.uid())
  );
create policy "owners and admins can create invites"
  on invites for insert with check (
    exists (select 1 from chat_members m where m.chat_id = invites.chat_id and m.user_id = auth.uid()
            and m.role in ('owner', 'admin'))
  );
create policy "owners and admins can revoke invites"
  on invites for update using (
    exists (select 1 from chat_members m where m.chat_id = invites.chat_id and m.user_id = auth.uid()
            and m.role in ('owner', 'admin'))
  );

-- Messages: only chat members can read/write; only the sender can edit/delete own.
create policy "members can read messages in their chats"
  on messages for select using (
    exists (select 1 from chat_members m where m.chat_id = messages.chat_id and m.user_id = auth.uid())
  );
create policy "members can send messages to their chats"
  on messages for insert with check (
    auth.uid() = sender_id and
    exists (select 1 from chat_members m where m.chat_id = messages.chat_id and m.user_id = auth.uid())
  );
create policy "senders can edit or delete their own messages"
  on messages for update using (auth.uid() = sender_id);

-- Message status: a user manages only their own read/delivered markers,
-- but can see status rows for messages in chats they belong to (read receipts).
create policy "members can view statuses in their chats"
  on message_status for select using (
    exists (
      select 1 from messages msg
      join chat_members m on m.chat_id = msg.chat_id
      where msg.id = message_status.message_id and m.user_id = auth.uid()
    )
  );
create policy "users set their own message status"
  on message_status for insert with check (auth.uid() = user_id);
create policy "users update their own message status"
  on message_status for update using (auth.uid() = user_id);

-- Stories: readable by everyone (public, ephemeral feed); only author writes.
create policy "stories are readable by authenticated users"
  on stories for select using (auth.role() = 'authenticated' and expires_at > now());
create policy "users post their own stories"
  on stories for insert with check (auth.uid() = author_id);
create policy "authors can delete their own stories"
  on stories for delete using (auth.uid() = author_id);

create policy "story views readable by story author and viewer"
  on story_views for select using (
    auth.uid() = viewer_id
    or exists (select 1 from stories s where s.id = story_views.story_id and s.author_id = auth.uid())
  );
create policy "users record their own story views"
  on story_views for insert with check (auth.uid() = viewer_id);
