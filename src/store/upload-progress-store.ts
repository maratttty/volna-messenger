import { create } from 'zustand';

// Keyed by the optimistic message's client_id, not chat_id/message_id — lets
// each MessageBubble subscribe to only its own upload, so a progress tick
// re-renders one bubble instead of the whole message list.
interface UploadProgressStore {
  progress: Record<string, number>; // clientId -> 0..1
  setProgress: (clientId: string, fraction: number) => void;
  clearProgress: (clientId: string) => void;
}

export const useUploadProgressStore = create<UploadProgressStore>((set) => ({
  progress: {},

  setProgress: (clientId, fraction) =>
    set((s) => ({ progress: { ...s.progress, [clientId]: fraction } })),

  clearProgress: (clientId) =>
    set((s) => {
      if (!(clientId in s.progress)) return s;
      const next = { ...s.progress };
      delete next[clientId];
      return { progress: next };
    }),
}));
