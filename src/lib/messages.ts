import { supabase } from './supabase';
import type { Message, MessageStatusValue, MessageType } from '../types/database';
import { MAX_MESSAGE_LENGTH } from '../config';
import type { UploadResult } from './storage';

const PAGE_SIZE = 30;

// Cursor-based pagination: fetch messages older than `before` (or the most
// recent page if `before` is omitted), returned oldest-first for rendering.
export async function fetchMessages(
  chatId: string,
  before?: string,
): Promise<{ messages: Message[]; hasMore: boolean }> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return { messages: page.reverse() as Message[], hasMore };
}

// Full-text search within one chat, using the generated search_vector column
// (russian to_tsvector). websearch_to_tsquery tolerates natural typed input
// (quotes, "-exclude", etc.) better than a raw plainto_tsquery.
export async function searchMessagesInChat(chatId: string, query: string): Promise<Message[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('deleted', false)
    .textSearch('search_vector', trimmed, { type: 'websearch', config: 'russian' })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as Message[];
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
      },
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
    .neq('sender_id', userId);

  if (!unread || unread.length === 0) return;

  const statusRows = unread.map((m: { id: string }) => ({
    message_id: m.id,
    user_id: userId,
    status: 'read' as MessageStatusValue,
    updated_at: new Date().toISOString(),
  }));

  await supabase.from('message_status').upsert(statusRows, { onConflict: 'message_id,user_id' });

  const lastId = unread[unread.length - 1].id;
  await supabase
    .from('chat_members')
    .update({ last_read_message_id: lastId })
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
