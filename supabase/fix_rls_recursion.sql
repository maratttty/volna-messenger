-- Fix: "infinite recursion detected in policy for relation chat_members".
-- Several policies check membership via a subquery against chat_members from
-- within chat_members' own policies (and from chats/invites/messages policies
-- that touch chat_members). Postgres re-applies chat_members' SELECT policy
-- for every row touched by that subquery, which re-triggers the same
-- subquery — infinite loop. SECURITY DEFINER helper functions run as the
-- table owner, which bypasses RLS internally, breaking the recursion.

create or replace function is_chat_member(p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from chat_members
    where chat_id = p_chat_id and user_id = p_user_id
  );
$$;

create or replace function is_chat_admin(p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from chat_members
    where chat_id = p_chat_id and user_id = p_user_id and role in ('owner', 'admin')
  );
$$;

-- chats
drop policy if exists "members can read their chats" on chats;
create policy "members can read their chats"
  on chats for select using (is_chat_member(id, auth.uid()));

drop policy if exists "owners and admins can update chat" on chats;
create policy "owners and admins can update chat"
  on chats for update using (is_chat_admin(id, auth.uid()));

-- chat_members
drop policy if exists "members can see member list of their chats" on chat_members;
create policy "members can see member list of their chats"
  on chat_members for select using (is_chat_member(chat_id, auth.uid()));

drop policy if exists "owners and admins can manage members" on chat_members;
create policy "owners and admins can manage members"
  on chat_members for insert with check (
    is_chat_admin(chat_id, auth.uid()) or user_id = auth.uid()
  );

drop policy if exists "members can update their own membership row" on chat_members;
create policy "members can update their own membership row"
  on chat_members for update using (
    auth.uid() = user_id or is_chat_admin(chat_id, auth.uid())
  );

drop policy if exists "members can leave or be removed by admins" on chat_members;
create policy "members can leave or be removed by admins"
  on chat_members for delete using (
    auth.uid() = user_id or is_chat_admin(chat_id, auth.uid())
  );

-- invites
drop policy if exists "members can view invites for their chats" on invites;
create policy "members can view invites for their chats"
  on invites for select using (is_chat_member(chat_id, auth.uid()));

drop policy if exists "owners and admins can create invites" on invites;
create policy "owners and admins can create invites"
  on invites for insert with check (is_chat_admin(chat_id, auth.uid()));

drop policy if exists "owners and admins can revoke invites" on invites;
create policy "owners and admins can revoke invites"
  on invites for update using (is_chat_admin(chat_id, auth.uid()));

-- messages
drop policy if exists "members can read messages in their chats" on messages;
create policy "members can read messages in their chats"
  on messages for select using (is_chat_member(chat_id, auth.uid()));

drop policy if exists "members can send messages to their chats" on messages;
create policy "members can send messages to their chats"
  on messages for insert with check (
    auth.uid() = sender_id and is_chat_member(chat_id, auth.uid())
  );

-- message_status
drop policy if exists "members can view statuses in their chats" on message_status;
create policy "members can view statuses in their chats"
  on message_status for select using (
    exists (
      select 1 from messages msg
      where msg.id = message_status.message_id and is_chat_member(msg.chat_id, auth.uid())
    )
  );
