import type { ChatWithMeta } from '../types/database';

const key = (userId: string) => `fw_chats_${userId}`;

export function saveChatsCache(userId: string, chats: ChatWithMeta[]): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(chats));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function loadChatsCache(userId: string): ChatWithMeta[] | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    return JSON.parse(raw) as ChatWithMeta[];
  } catch {
    return null;
  }
}

export function clearChatsCache(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch { /* ignore */ }
}
