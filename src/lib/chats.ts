import { supabase } from './supabase';
import type { ChatWithMeta, Profile, MemberRole, MemberWithProfile, Invite } from '../types/database';

// Fetch all chats the current user belongs to, enriched with last message + unread count.
//
// Old approach: 2 + N*4 sequential queries per chat = ~42 queries for 10 chats.
// New approach: 6 batch queries + N*2 parallel queries = ~26 queries for 10 chats,
//   with sequential depth of 2 instead of 4 — loads 2-3× faster.
export async function fetchChats(userId: string): Promise<ChatWithMeta[]> {
  // ── Round 1: memberships ──────────────────────────────────────────
  const { data: memberships, error: memErr } = await supabase
    .from('chat_members')
    .select('chat_id, role, last_read_message_id, muted, pinned_at')
    .eq('user_id', userId);

  if (memErr) throw memErr;
  if (!memberships || memberships.length === 0) return [];

  const chatIds = memberships.map((m: { chat_id: string }) => m.chat_id);

  // ── Round 2: chats + batch pre-fetches in parallel ────────────────
  const [{ data: chats, error: chatErr }, { data: allOtherMembers }, { data: lastReadMsgs }] =
    await Promise.all([
      // All chat rows
      supabase.from('chats').select('*').in('id', chatIds),

      // Other-user IDs for all direct chats in one query
      supabase
        .from('chat_members')
        .select('chat_id, user_id')
        .in('chat_id', chatIds)
        .neq('user_id', userId),

      // Timestamps of all last-read messages in one query (needed for unread count)
      supabase
        .from('messages')
        .select('id, created_at')
        .in(
          'id',
          memberships.map((m: { last_read_message_id: string | null }) => m.last_read_message_id).filter(Boolean) as string[],
        ),
    ]);

  if (chatErr) throw chatErr;
  if (!chats) return [];

  // Build lookup maps from the batch results
  const otherUserIdByChatId = new Map<string, string>();
  for (const m of allOtherMembers ?? []) {
    if (!otherUserIdByChatId.has(m.chat_id)) otherUserIdByChatId.set(m.chat_id, m.user_id);
  }

  const lastReadAtById = new Map<string, string>();
  for (const m of lastReadMsgs ?? []) lastReadAtById.set(m.id, m.created_at);

  // ── Round 3: batch-fetch all other-user profiles in one query ─────
  const otherUserIds = [...new Set(otherUserIdByChatId.values())];
  const { data: profiles } = otherUserIds.length
    ? await supabase.from('profiles').select('*').in('id', otherUserIds)
    : { data: [] };

  const profileById = new Map<string, Profile>();
  for (const p of profiles ?? []) profileById.set(p.id, p as Profile);

  // ── Round 4: per-chat last message + unread count in parallel ─────
  type Membership = { chat_id: string; role: MemberRole; last_read_message_id: string | null; muted: boolean; pinned_at: string | null };
  const membershipByChatId = new Map(
    (memberships as Membership[]).map((m) => [m.chat_id, m]),
  );

  const enriched = await Promise.all(
    chats.map(async (chat: Record<string, unknown>) => {
      const chatId = chat.id as string;
      const membership = membershipByChatId.get(chatId);

      // Last message and unread count run in parallel
      const lastReadId = membership?.last_read_message_id ?? null;
      const lastReadAt = lastReadId ? lastReadAtById.get(lastReadId) : undefined;

      const [{ data: lastMsgs }, unreadResult] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .eq('deleted', false)
          .order('created_at', { ascending: false })
          .limit(1),

        lastReadAt
          // Has a known "last read" timestamp — count only newer non-own messages
          ? supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('chat_id', chatId)
              .eq('deleted', false)
              .neq('sender_id', userId)
              .gt('created_at', lastReadAt)
          : // Never read anything — count all non-own messages
            supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('chat_id', chatId)
              .eq('deleted', false)
              .neq('sender_id', userId),
      ]);

      const otherId  = otherUserIdByChatId.get(chatId);
      const otherUser = otherId ? profileById.get(otherId) : undefined;

      return {
        ...chat,
        otherUser,
        lastMessage:           lastMsgs?.[0] ?? undefined,
        unreadCount:           unreadResult.count ?? 0,
        myRole:                (membership?.role as MemberRole) ?? 'member',
        muted:                 (membership?.muted as boolean) ?? false,
        pinned_at:             (membership?.pinned_at as string | null) ?? null,
        last_read_message_id:  lastReadId,
      } as ChatWithMeta;
    }),
  );

  enriched.sort(chatComparator);
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

// Group title/avatar — RLS restricts this to owners/admins
// ("owners and admins can update chat").
export async function updateChatInfo(
  chatId: string,
  fields: { title?: string; avatarUrl?: string },
): Promise<void> {
  const update: Record<string, string> = {};
  if (fields.title !== undefined) update.title = fields.title.trim();
  if (fields.avatarUrl !== undefined) update.avatar_url = fields.avatarUrl;

  const { error } = await supabase.from('chats').update(update).eq('id', chatId);
  if (error) throw error;
}

// Goes through RPCs (any member can pin, unlike title/avatar which is
// owner/admin-only) — see supabase/add_pinned_message.sql for why this can't
// just be a second UPDATE policy on `chats`.
export async function pinMessage(chatId: string, messageId: string): Promise<void> {
  const { error } = await supabase.rpc('pin_message', { p_chat_id: chatId, p_message_id: messageId });
  if (error) throw error;
}

export async function unpinMessage(chatId: string): Promise<void> {
  const { error } = await supabase.rpc('unpin_message', { p_chat_id: chatId });
  if (error) throw error;
}

// Mute affects only the caller's own membership row — RLS lets a member
// update their own row (see "members can update their own membership row").
export async function setChatMuted(chatId: string, userId: string, muted: boolean): Promise<void> {
  const { error } = await supabase
    .from('chat_members')
    .update({ muted })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
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

// Shared sort: pinned chats first (by pin time desc), then by last message time desc.
export function chatComparator(a: ChatWithMeta, b: ChatWithMeta): number {
  if (a.pinned_at && !b.pinned_at) return -1;
  if (!a.pinned_at && b.pinned_at) return 1;
  if (a.pinned_at && b.pinned_at) return b.pinned_at.localeCompare(a.pinned_at);
  const ta = a.lastMessage?.created_at ?? a.created_at;
  const tb = b.lastMessage?.created_at ?? b.created_at;
  return tb.localeCompare(ta);
}

export async function pinChat(chatId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_members')
    .update({ pinned_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function unpinChat(chatId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_members')
    .update({ pinned_at: null })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function markChatRead(chatId: string, userId: string): Promise<void> {
  const { data: last } = await supabase
    .from('messages')
    .select('id')
    .eq('chat_id', chatId)
    .eq('deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from('chat_members')
    .update({ last_read_message_id: last?.id ?? null })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function markChatUnread(chatId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_members')
    .update({ last_read_message_id: null })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
}

// "Delete" from the user's perspective = leave the chat (remove membership).
// The chat itself and its messages remain for other members.
export async function leaveAndDeleteChat(chatId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_members')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
}
