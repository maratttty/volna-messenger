import { supabase } from './supabase';
import type { Message, MessageStatusValue, MessageType, PinEntry } from '../types/database';
import { MAX_MESSAGE_LENGTH } from '../config';
import type { UploadResult } from './storage';

const PAGE_SIZE = 30;

// Message ids this user has hidden for themself in this chat ("delete for
// me" — see message_hidden_for_user). Small per-chat list in practice, so a
// plain id-exclusion filter on the messages query is fine for MVP scale.
async function fetchHiddenMessageIds(chatId: string, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('message_hidden_for_user')
    .select('message_id')
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { message_id: string }) => r.message_id);
}

// For displaying a pinned-message banner whose target may be older than
// whatever page is currently loaded — fetched directly by id instead of
// paging back through history just to find it.
export async function fetchMessageById(messageId: string): Promise<Message | null> {
  const { data, error } = await supabase.from('messages').select('*').eq('id', messageId).maybeSingle();
  if (error) throw error;
  return (data as Message) ?? null;
}

// Cursor-based pagination: fetch messages older than `before` (or the most
// recent page if `before` is omitted), returned oldest-first for rendering.
// afterTimestamp: when set, skips messages older than this timestamp — used to
// hide history before a "delete for me" soft-delete point.
export async function fetchMessages(
  chatId: string,
  userId: string,
  before?: string,
  afterTimestamp?: string | null,
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const hiddenIds = await fetchHiddenMessageIds(chatId, userId);

  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('deleted', false)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (before) query = query.lt('created_at', before);
  if (afterTimestamp) query = query.gt('created_at', afterTimestamp);
  if (hiddenIds.length > 0) query = query.not('id', 'in', `(${hiddenIds.join(',')})`);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return { messages: page.reverse() as Message[], hasMore };
}

// Substring search within one chat. Case-insensitive, matches partial words
// (unlike full-text search, which only matches whole lexemes/stems) — needed
// for search-as-you-type where the user hasn't finished typing a word yet.
export async function searchMessagesInChat(chatId: string, userId: string, query: string): Promise<Message[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const hiddenIds = await fetchHiddenMessageIds(chatId, userId);
  const escaped = trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`);

  let q = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('deleted', false)
    .ilike('content', `%${escaped}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (hiddenIds.length > 0) q = q.not('id', 'in', `(${hiddenIds.join(',')})`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Message[];
}

// "Delete for me": hides one message from this user's own view only. Other
// participants (including the sender) are unaffected — contrast with
// deleteMessage(), which is "delete for everyone" and RLS-restricted to the
// sender.
export async function hideMessageForMe(messageId: string, chatId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('message_hidden_for_user')
    .upsert(
      { message_id: messageId, chat_id: chatId, user_id: userId },
      { onConflict: 'message_id,user_id' },
    );
  if (error) throw error;
}

export async function sendMessage(params: {
  chatId: string;
  senderId: string;
  content: string;
  clientId: string;
  replyToId?: string | null;
}): Promise<Message> {
  const content = params.content.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!content) throw new Error('Сообщение не может быть пустым');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: params.chatId,
      sender_id: params.senderId,
      type: 'text',
      content,
      client_id: params.clientId,
      reply_to_id: params.replyToId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Message;
}

export async function sendAttachmentMessage(params: {
  chatId: string;
  senderId: string;
  clientId: string;
  type: MessageType;
  upload: UploadResult;
  duration?: number;
  posterUrl?: string;
  replyToId?: string | null;
}): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: params.chatId,
      sender_id: params.senderId,
      type: params.type,
      content: null,
      attachment_url: params.upload.url,
      attachment_meta: {
        name: params.upload.name,
        size: params.upload.size,
        mime: params.upload.mime,
        duration: params.duration,
        posterUrl: params.posterUrl,
      },
      client_id: params.clientId,
      reply_to_id: params.replyToId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Message;
}

// GIFs come from GIPHY's CDN — no upload to our own Storage, just point the
// message at GIPHY's URL directly. Reuses the 'image' type since GIFs render
// fine through the same <img> path (they animate natively in <img>).
export async function sendGifMessage(params: {
  chatId: string;
  senderId: string;
  clientId: string;
  gifUrl: string;
  title: string;
  replyToId?: string | null;
}): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: params.chatId,
      sender_id: params.senderId,
      type: 'image',
      content: null,
      attachment_url: params.gifUrl,
      attachment_meta: { name: params.title, mime: 'image/gif' },
      client_id: params.clientId,
      reply_to_id: params.replyToId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Message;
}

// Copies a message into another chat. Chains to the ORIGINAL sender/name even
// when forwarding a message that was itself already forwarded, matching
// Telegram's "Forwarded from X" behavior (never points at the last forwarder).
export async function forwardMessage(params: {
  message: Message;
  targetChatId: string;
  senderId: string;
  clientId: string;
  originalSenderName: string;
}): Promise<Message> {
  const { message, targetChatId, senderId, clientId, originalSenderName } = params;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: targetChatId,
      sender_id: senderId,
      type: message.type,
      content: message.content,
      attachment_url: message.attachment_url,
      attachment_meta: message.attachment_meta,
      client_id: clientId,
      reply_to_id: null,
      forwarded_from_id: message.forwarded_from_id ?? message.sender_id,
      forwarded_from_name: message.forwarded_from_name ?? originalSenderName,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Message;
}

export async function editMessage(messageId: string, content: string): Promise<void> {
  const trimmed = content.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) throw new Error('Сообщение не может быть пустым');
  const { error } = await supabase
    .from('messages')
    .update({ content: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted: true, content: null, attachment_url: null })
    .eq('id', messageId);
  if (error) throw error;
}

// Marks every message in the chat not sent by `userId` as read, and advances
// the member's last_read_message_id cursor (powers the unread badge).
export async function markChatRead(chatId: string, userId: string): Promise<void> {
  const { data: unread } = await supabase
    .from('messages')
    .select('id')
    .eq('chat_id', chatId)
    .eq('deleted', false)
    .neq('sender_id', userId)
    .order('created_at', { ascending: true });

  if (!unread || unread.length === 0) return;

  const statusRows = unread.map((m: { id: string }) => ({
    message_id: m.id,
    user_id: userId,
    status: 'read' as MessageStatusValue,
    updated_at: new Date().toISOString(),
  }));

  await supabase.from('message_status').upsert(statusRows, { onConflict: 'message_id,user_id' });
  // Cursor (last_read_message_id) is managed exclusively by updateReadCursor().
  // Updating it here created a race: this function runs 3 sequential DB calls
  // while updateReadCursor() may advance the cursor between them, and our
  // stale query result would then overwrite the newer value.
}

// Advances the per-member read cursor in chat_members so fetchChats reports
// the correct unread count on next load/refresh. Called whenever a message is
// visibly read (on chat open via markChatRead, and on each incoming realtime
// message while the chat is open).
export async function updateReadCursor(chatId: string, userId: string, messageId: string): Promise<void> {
  await supabase
    .from('chat_members')
    .update({ last_read_message_id: messageId })
    .eq('chat_id', chatId)
    .eq('user_id', userId);
}

export async function markMessageRead(messageId: string, userId: string): Promise<void> {
  await supabase
    .from('message_status')
    .upsert(
      { message_id: messageId, user_id: userId, status: 'read', updated_at: new Date().toISOString() },
      { onConflict: 'message_id,user_id' },
    );
}

// Called as soon as a message reaches any of the recipient's open clients,
// regardless of which chat is currently active. Never downgrades an existing
// 'read' row back to 'delivered'.
export async function markMessageDelivered(messageId: string, userId: string): Promise<void> {
  await supabase
    .from('message_status')
    .upsert(
      { message_id: messageId, user_id: userId, status: 'delivered', updated_at: new Date().toISOString() },
      { onConflict: 'message_id,user_id', ignoreDuplicates: true },
    );
}

// ── Pins (personal = только у себя, shared = у всех в чате) ─────────────────

export async function pinMessage(chatId: string, messageId: string, isPersonal: boolean): Promise<void> {
  const { error } = await supabase.rpc('pin_message', {
    p_chat_id: chatId,
    p_message_id: messageId,
    p_is_personal: isPersonal,
  });
  if (error) throw error;
}

export async function unpinMessage(chatId: string, messageId: string, isPersonal: boolean): Promise<void> {
  const { error } = await supabase.rpc('unpin_message', {
    p_chat_id: chatId,
    p_message_id: messageId,
    p_is_personal: isPersonal,
  });
  if (error) throw error;
}

export async function fetchPins(chatId: string): Promise<PinEntry[]> {
  const { data: pinRows, error: pinError } = await supabase
    .from('pins')
    .select('message_id, pinned_by, pinned_at, is_personal')
    .eq('chat_id', chatId)
    .order('pinned_at', { ascending: true });
  if (pinError) throw pinError;
  if (!pinRows || pinRows.length === 0) return [];

  type PinRow = { message_id: string; pinned_by: string; pinned_at: string; is_personal: boolean };
  const rows = pinRows as PinRow[];

  const messageIds = [...new Set(rows.map((r) => r.message_id))];
  const { data: msgs, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .in('id', messageIds);
  if (msgError) throw msgError;

  const msgMap = new Map(((msgs ?? []) as Message[]).map((m) => [m.id, m]));

  return rows
    .filter((r) => msgMap.has(r.message_id))
    .map((r) => ({
      messageId: r.message_id,
      message: msgMap.get(r.message_id)!,
      isPersonal: r.is_personal,
      pinnedBy: r.pinned_by,
      pinnedAt: r.pinned_at,
    }));
}

// Status map for messages sent by the current user (id -> best status across recipients)
export async function fetchOwnMessageStatuses(
  messageIds: string[],
): Promise<Map<string, MessageStatusValue>> {
  if (messageIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('message_status')
    .select('message_id, status')
    .in('message_id', messageIds);
  if (error) throw error;

  const map = new Map<string, MessageStatusValue>();
  for (const row of data ?? []) {
    const existing = map.get(row.message_id);
    // 'read' outranks 'delivered' if multiple recipients (groups)
    if (!existing || row.status === 'read') map.set(row.message_id, row.status);
  }
  return map;
}
