import { create } from 'zustand';
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme';

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

// Thin reactive wrapper around lib/theme.ts's localStorage-backed preference
// — lets the Settings toggle re-render without prop drilling. The actual
// dark/light CSS application happens in theme.ts, not here.
export const useThemeStore = create<ThemeStore>((set) => ({
  preference: getThemePreference(),
  setPreference: (pref) => {
    setThemePreference(pref);
    set({ preference: pref });
  },
}));
