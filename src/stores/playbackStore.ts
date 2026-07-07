import { create } from 'zustand';

type PlaybackType = 'voice' | 'video_note';

interface PlaybackStore {
  messageId: string | null;
  type: PlaybackType | null;
  senderName: string;
  mediaEl: HTMLMediaElement | null;
  playing: boolean;
  speed: number;
  muted: boolean;
  pendingPlay: string | null;

  activate: (messageId: string, type: PlaybackType, senderName: string, el: HTMLMediaElement) => void;
  deactivate: () => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setMuted: (muted: boolean) => void;
  setPendingPlay: (id: string | null) => void;
}

const SPEEDS = [1, 1.5, 2] as const;

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  messageId: null,
  type: null,
  senderName: '',
  mediaEl: null,
  playing: false,
  speed: 1,
  muted: false,
  pendingPlay: null,

  activate: (messageId, type, senderName, el) => {
    const prev = get().mediaEl;
    if (prev && prev !== el) {
      prev.pause();
      prev.currentTime = 0;
    }
    el.playbackRate = get().speed;
    el.muted = get().muted;
    set({ messageId, type, senderName, mediaEl: el, playing: true, muted: el.muted });
  },

  deactivate: () => {
    const { mediaEl } = get();
    if (mediaEl) {
      mediaEl.pause();
      mediaEl.currentTime = 0;
    }
    set({ messageId: null, type: null, mediaEl: null, playing: false, pendingPlay: null });
  },

  setPlaying: (playing) => set({ playing }),

  setSpeed: (speed) => {
    const { mediaEl } = get();
    if (mediaEl) mediaEl.playbackRate = speed;
    set({ speed });
  },

  setMuted: (muted) => {
    const { mediaEl } = get();
    if (mediaEl) mediaEl.muted = muted;
    set({ muted });
  },

  setPendingPlay: (pendingPlay) => set({ pendingPlay }),
}));

export { SPEEDS };
export type { PlaybackType };
