import type { Message } from '../types/database';

interface CachedPage {
  messages: Message[];
  hasMore: boolean;
}

const key = (userId: string, chatId: string) => `fw_messages_${userId}_${chatId}`;

export function saveMessagesCache(userId: string, chatId: string, messages: Message[], hasMore: boolean): void {
  try {
    localStorage.setItem(key(userId, chatId), JSON.stringify({ messages, hasMore }));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function loadMessagesCache(userId: string, chatId: string): CachedPage | null {
  try {
    const raw = localStorage.getItem(key(userId, chatId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedPage;
  } catch {
    return null;
  }
}
