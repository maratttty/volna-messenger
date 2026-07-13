import { create } from 'zustand';

export type SendStatus = 'queued' | 'failed';

interface SendStatusStore {
  // keyed by client_id — mirrors the persisted outbox (src/lib/outbox.ts) so
  // components can react without reading IndexedDB on every render.
  status: Record<string, SendStatus>;
  setStatus: (clientId: string, status: SendStatus) => void;
  clearStatus: (clientId: string) => void;
}

export const useSendStatusStore = create<SendStatusStore>((set) => ({
  status: {},
  setStatus: (clientId, status) => set((s) => ({ status: { ...s.status, [clientId]: status } })),
  clearStatus: (clientId) =>
    set((s) => {
      if (!(clientId in s.status)) return s;
      const status = { ...s.status };
      delete status[clientId];
      return { status };
    }),
}));
