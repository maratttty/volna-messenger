import { create } from 'zustand';
import type { ChatWithMeta } from '../types/database';

interface ChatStore {
  chats: ChatWithMeta[];
  activeChatId: string | null;

  setChats: (chats: ChatWithMeta[]) => void;
  upsertChat: (chat: ChatWithMeta) => void;
  setActiveChatId: (id: string | null) => void;
  markRead: (chatId: string, messageId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  chats: [],
  activeChatId: null,

  setChats: (chats) => set({ chats }),

  upsertChat: (chat) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id);
      if (idx === -1) return { chats: [chat, ...state.chats] };
      const next = [...state.chats];
      next[idx] = chat;
      // Re-sort by last message time
      next.sort((a, b) => {
        const ta = a.lastMessage?.created_at ?? a.created_at;
        const tb = b.lastMessage?.created_at ?? b.created_at;
        return tb.localeCompare(ta);
      });
      return { chats: next };
    }),

  setActiveChatId: (id) => set({ activeChatId: id }),

  markRead: (chatId, messageId) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: 0, myMember: { ...c, last_read_message_id: messageId } } : c,
      ),
    })),
}));
