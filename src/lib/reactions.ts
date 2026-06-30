import { supabase } from './supabase';
import type { MessageReaction, ReactionSummary } from '../types/database';

// One reaction per (message, user) — setting a new emoji replaces whatever
// this user had on the message before.
export async function setReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
}

export async function removeReaction(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchReactions(messageIds: string[]): Promise<MessageReaction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase.from('message_reactions').select('*').in('message_id', messageIds);
  if (error) throw error;
  return (data ?? []) as MessageReaction[];
}

// Groups raw (message, user, emoji) rows into per-message, per-emoji counts
// for rendering — one pill per distinct emoji, "reactedByMe" drives the
// highlighted/toggle-off state.
export function groupReactions(rows: MessageReaction[], currentUserId: string): Map<string, ReactionSummary[]> {
  const byMessage = new Map<string, Map<string, ReactionSummary>>();
  for (const row of rows) {
    let byEmoji = byMessage.get(row.message_id);
    if (!byEmoji) {
      byEmoji = new Map();
      byMessage.set(row.message_id, byEmoji);
    }
    const existing = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, reactedByMe: false };
    existing.count += 1;
    if (row.user_id === currentUserId) existing.reactedByMe = true;
    byEmoji.set(row.emoji, existing);
  }
  const result = new Map<string, ReactionSummary[]>();
  for (const [messageId, byEmoji] of byMessage) {
    result.set(messageId, Array.from(byEmoji.values()));
  }
  return result;
}
