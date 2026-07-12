import { create } from 'zustand';

// Keyed by the optimistic message's client_id, not chat_id/message_id — lets
// each MessageBubble subscribe to only its own upload, so a progress tick
// re-renders one bubble instead of the whole message list.
interface UploadProgressStore {
  progress: Record<string, number>; // clientId -> 0..1
  abortHandlers: Record<string, () => void>;
  setProgress: (clientId: string, fraction: number) => void;
  clearProgress: (clientId: string) => void;
  registerAbort: (clientId: string, abort: () => void) => void;
  // Called by the X button in the UI — triggers the in-flight XHR's abort().
  // The rest of the cleanup (removing the optimistic message, clearing this
  // store) happens where the upload promise rejects, in useMessages.ts.
  cancelUpload: (clientId: string) => void;
}

export const useUploadProgressStore = create<UploadProgressStore>((set, get) => ({
  progress: {},
  abortHandlers: {},

  setProgress: (clientId, fraction) =>
    set((s) => ({ progress: { ...s.progress, [clientId]: fraction } })),

  clearProgress: (clientId) =>
    set((s) => {
      if (!(clientId in s.progress) && !(clientId in s.abortHandlers)) return s;
      const progress = { ...s.progress };
      const abortHandlers = { ...s.abortHandlers };
      delete progress[clientId];
      delete abortHandlers[clientId];
      return { progress, abortHandlers };
    }),

  registerAbort: (clientId, abort) =>
    set((s) => ({ abortHandlers: { ...s.abortHandlers, [clientId]: abort } })),

  cancelUpload: (clientId) => {
    get().abortHandlers[clientId]?.();
  },
}));
