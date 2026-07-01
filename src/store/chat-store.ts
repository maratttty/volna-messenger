import { create } from 'zustand';
import type { ChatWithMeta } from '../types/database';
import { chatComparator } from '../lib/chats';

interface ChatStore {
  chats: ChatWithMeta[];
  activeChatId: string | null;

  setChats: (chats: ChatWithMeta[]) => void;
  upsertChat: (chat: ChatWithMeta) => void;
  removeChat: (chatId: string) => void;
  setActiveChatId: (id: string | null) => void;
  markRead: (chatId: string, messageId: string) => void;
  setMuted: (chatId: string, muted: boolean) => void;
  setPinned: (chatId: string, pinned_at: string | null) => void;
  setUnreadCount: (chatId: string, count: number) => void;
  patchChat: (chatId: string, patch: Partial<ChatWithMeta>) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  chats: [],
  activeChatId: null,

  setChats: (chats) => set({ chats: [...chats].sort(chatComparator) }),

  upsertChat: (chat) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id);
      const next = idx === -1 ? [chat, ...state.chats] : state.chats.map((c, i) => (i === idx ? chat : c));
      return { chats: [...next].sort(chatComparator) };
    }),

  removeChat: (chatId) =>
    set((state) => ({ chats: state.chats.filter((c) => c.id !== chatId) })),

  setActiveChatId: (id) => set({ activeChatId: id }),

  markRead: (chatId, messageId) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: 0, last_read_message_id: messageId } : c,
      ),
    })),

  setMuted: (chatId, muted) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, muted } : c)),
    })),

  setPinned: (chatId, pinned_at) =>
    set((state) => {
      const next = state.chats.map((c) => (c.id === chatId ? { ...c, pinned_at } : c));
      return { chats: [...next].sort(chatComparator) };
    }),

  setUnreadCount: (chatId, count) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: count } : c)),
    })),

  patchChat: (chatId, patch) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
    })),
}));
