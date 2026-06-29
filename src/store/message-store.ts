import { create } from 'zustand';
import type { Message } from '../types/database';

interface MessageStore {
  // messages per chat, newest last
  messages: Record<string, Message[]>;
  // whether there are older pages to load
  hasMore: Record<string, boolean>;
  // pending outbox: client_id → temp optimistic message
  pending: Record<string, Message>;

  setMessages: (chatId: string, msgs: Message[], hasMore: boolean) => void;
  prependMessages: (chatId: string, msgs: Message[], hasMore: boolean) => void;
  appendMessage: (chatId: string, msg: Message) => void;
  confirmMessage: (chatId: string, clientId: string, confirmed: Message) => void;
  updateMessage: (chatId: string, updated: Partial<Message> & { id: string }) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  addPending: (clientId: string, msg: Message) => void;
  removePending: (clientId: string) => void;
}

export const useMessageStore = create<MessageStore>((set) => ({
  messages: {},
  hasMore: {},
  pending: {},

  setMessages: (chatId, msgs, hasMore) =>
    set((s) => ({
      messages: { ...s.messages, [chatId]: msgs },
      hasMore: { ...s.hasMore, [chatId]: hasMore },
    })),

  prependMessages: (chatId, msgs, hasMore) =>
    set((s) => {
      const existing = s.messages[chatId] ?? [];
      const existingIds = new Set(existing.map((m) => m.id));
      const deduped = msgs.filter((m) => !existingIds.has(m.id));
      return {
        messages: { ...s.messages, [chatId]: [...deduped, ...existing] },
        hasMore: { ...s.hasMore, [chatId]: hasMore },
      };
    }),

  appendMessage: (chatId, msg) =>
    set((s) => {
      const existing = s.messages[chatId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return s;
      return { messages: { ...s.messages, [chatId]: [...existing, msg] } };
    }),

  // Replace the optimistic stub with the server-confirmed version
  confirmMessage: (chatId, clientId, confirmed) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.client_id === clientId ? confirmed : m,
        ),
      },
      pending: Object.fromEntries(Object.entries(s.pending).filter(([k]) => k !== clientId)),
    })),

  updateMessage: (chatId, updated) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === updated.id ? { ...m, ...updated } : m,
        ),
      },
    })),

  removeMessage: (chatId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).filter((m) => m.id !== messageId),
      },
    })),

  addPending: (clientId, msg) =>
    set((s) => ({ pending: { ...s.pending, [clientId]: msg } })),

  removePending: (clientId) =>
    set((s) => ({
      pending: Object.fromEntries(Object.entries(s.pending).filter(([k]) => k !== clientId)),
    })),
}));
