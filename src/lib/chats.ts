import { supabase } from './supabase';
import type { ChatWithMeta, Profile, MemberRole, MemberWithProfile, Invite } from '../types/database';

// Fetch all chats the current user belongs to, enriched with last message + unread count
export async function fetchChats(userId: string): Promise<ChatWithMeta[]> {
  // Get chat memberships
  const { data: memberships, error: memErr } = await supabase
    .from('chat_members')
    .select('chat_id, role, last_read_message_id, muted')
    .eq('user_id', userId);

  if (memErr) throw memErr;
  if (!memberships || memberships.length === 0) return [];

  const chatIds = memberships.map((m: { chat_id: string }) => m.chat_id);

  // Get chat rows
  const { data: chats, error: chatErr } = await supabase
    .from('chats')
    .select('*')
    .in('id', chatIds);

  if (chatErr) throw chatErr;
  if (!chats) return [];

  // For each chat, fetch last message + unread count in parallel
  const enriched = await Promise.all(
    chats.map(async (chat: Record<string, unknown>) => {
      const membership = memberships.find((m: { chat_id: string }) => m.chat_id === chat.id);

      // Last message
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chat.id)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastMessage = lastMsgs?.[0] ?? undefined;

      // Unread count: messages after last_read_message_id not sent by the user
      let unreadCount = 0;
      if (membership?.last_read_message_id) {
        // Get the created_at of the last read message to use as a cursor
        const { data: lastRead } = await supabase
          .from('messages')
          .select('created_at')
          .eq('id', membership.last_read_message_id)
          .maybeSingle();

        if (lastRead) {
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chat.id)
            .eq('deleted', false)
            .neq('sender_id', userId)
            .gt('created_at', lastRead.created_at);
          unreadCount = count ?? 0;
        }
      } else {
        // No last read message — count all non-own messages
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .eq('deleted', false)
          .neq('sender_id', userId);
        unreadCount = count ?? 0;
      }

      // For direct chats, fetch the other user's profile
      let otherUser: Profile | undefined;
      if (chat.type === 'direct') {
        const { data: otherMembers } = await supabase
          .from('chat_members')
          .select('user_id')
          .eq('chat_id', chat.id)
          .neq('user_id', userId);

        const otherId = otherMembers?.[0]?.user_id;
        if (otherId) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherId)
            .maybeSingle();
          otherUser = prof ?? undefined;
        }
      }

      return {
        ...chat,
        otherUser,
        lastMessage,
        unreadCount,
        myRole: membership?.role ?? 'member',
      } as ChatWithMeta;
    }),
  );

  // Sort by last message time descending
  enriched.sort((a, b) => {
    const ta = a.lastMessage?.created_at ?? a.created_at;
    const tb = b.lastMessage?.created_at ?? b.created_at;
    return tb.localeCompare(ta);
  });

  return enriched;
}

// Find or create a 1-on-1 direct chat between two users
export async function getOrCreateDirectChat(
  currentUserId: string,
  otherUserId: string,
): Promise<string> {
  // Check if a direct chat already exists between the two users
  const { data: existing } = await supabase
    .from('chat_members')
    .select('chat_id')
    .eq('user_id', currentUserId);

  const myChats = (existing ?? []).map((r: { chat_id: string }) => r.chat_id);

  if (myChats.length > 0) {
    const { data: shared } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', otherUserId)
      .in('chat_id', myChats);

    if (shared && shared.length > 0) {
      // Check if any of these shared chats is a direct chat
      const sharedIds = shared.map((r: { chat_id: string }) => r.chat_id);
      const { data: directChats } = await supabase
        .from('chats')
        .select('id')
        .eq('type', 'direct')
        .in('id', sharedIds);

      if (directChats && directChats.length > 0) {
        return directChats[0].id as string;
      }
    }
  }

  // Create new direct chat
  const { data: newChat, error: chatErr } = await supabase
    .from('chats')
    .insert({ type: 'direct', created_by: currentUserId })
    .select('id')
    .single();

  if (chatErr || !newChat) throw chatErr ?? new Error('Failed to create chat');

  // Add both members
  const { error: memberErr } = await supabase.from('chat_members').insert([
    { chat_id: newChat.id, user_id: currentUserId, role: 'owner' },
    { chat_id: newChat.id, user_id: otherUserId, role: 'member' },
  ]);

  if (memberErr) throw memberErr;

  return newChat.id as string;
}

// Search users by username prefix (for new chat)
export async function searchUsers(query: string, excludeId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('username', `${query.toLowerCase().trim()}%`)
    .neq('id', excludeId)
    .limit(10);

  if (error) throw error;
  return (data ?? []) as Profile[];
}

// Inserts a plain narration row ("X joined the group", etc). sender_id is set
// to the user whose action triggered the event — the messages INSERT policy
// requires auth.uid() = sender_id, and there's no separate "system actor"
// identity, so attributing it to the actor is the only RLS-compatible option.
// MessageBubble's type==='system' branch never renders a sender name anyway.
export async function postSystemMessage(chatId: string, actorId: string, content: string): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    chat_id: chatId,
    sender_id: actorId,
    type: 'system',
    content,
    client_id: crypto.randomUUID(),
  });
  if (error) throw error;
}

export async function createGroup(creatorId: string, title: string, memberIds: string[]): Promise<string> {
  const { data: chat, error: chatErr } = await supabase
    .from('chats')
    .insert({ type: 'group', title: title.trim(), created_by: creatorId })
    .select('id')
    .single();
  if (chatErr || !chat) throw chatErr ?? new Error('Failed to create group');

  const rows = [
    { chat_id: chat.id, user_id: creatorId, role: 'owner' as MemberRole },
    ...memberIds.map((id) => ({ chat_id: chat.id, user_id: id, role: 'member' as MemberRole })),
  ];
  const { error: memberErr } = await supabase.from('chat_members').insert(rows);
  if (memberErr) throw memberErr;

  await postSystemMessage(chat.id, creatorId, 'Группа создана');

  return chat.id as string;
}

export async function fetchChatMembers(chatId: string): Promise<MemberWithProfile[]> {
  const { data, error } = await supabase
    .from('chat_members')
    .select('*, profile:profiles(*)')
    .eq('chat_id', chatId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MemberWithProfile[];
}

export async function updateMemberRole(chatId: string, userId: string, role: MemberRole): Promise<void> {
  const { error } = await supabase.from('chat_members').update({ role }).eq('chat_id', chatId).eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(chatId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', userId);
  if (error) throw error;
}

// Reuses an existing non-revoked invite for the chat instead of minting a new
// token every time the panel is opened — mirrors Telegram's persistent
// "invite link" (revoking and replacing it is a separate, deliberate action).
export async function getOrCreateInvite(chatId: string, creatorId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('invites')
    .select('token')
    .eq('chat_id', chatId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.token as string;

  const token = crypto.randomUUID().replace(/-/g, '');
  const { error } = await supabase.from('invites').insert({ chat_id: chatId, token, created_by: creatorId });
  if (error) throw error;
  return token;
}

// Goes through the get_invite_by_token RPC (SECURITY DEFINER), not a direct
// table read — the caller may not be a chat member yet (that's the whole
// point of joining via link), and the regular RLS policy on invites only
// allows members to read. See supabase/fix_invite_lookup.sql for why a
// direct "any authenticated user" policy isn't safe here.
export async function fetchInviteByToken(token: string): Promise<Invite | null> {
  const { data, error } = await supabase.rpc('get_invite_by_token', { p_token: token }).maybeSingle();
  if (error) throw error;
  return (data as Invite) ?? null;
}

// Joining is idempotent: re-visiting a link you already used just reports
// alreadyMember instead of erroring, since (chat_id, user_id) is the PK.
export async function joinChatViaInvite(
  token: string,
  userId: string,
): Promise<{ chatId: string; alreadyMember: boolean }> {
  const invite = await fetchInviteByToken(token);
  if (!invite) throw new Error('Ссылка-приглашение не найдена');
  if (invite.revoked) throw new Error('Эта ссылка-приглашение отозвана');
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error('Эта ссылка-приглашение истекла');
  }

  const { error } = await supabase
    .from('chat_members')
    .insert({ chat_id: invite.chat_id, user_id: userId, role: 'member' });

  if (error) {
    if (error.code === '23505') return { chatId: invite.chat_id, alreadyMember: true };
    throw error;
  }

  return { chatId: invite.chat_id, alreadyMember: false };
}
