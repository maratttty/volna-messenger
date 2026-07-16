// Persisted client-side display preference — not synced to the profile/DB.
// See index.html for the inline script that applies this before first paint
// (avoids a flash of the wrong theme while the JS bundle loads).
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'themePreference';

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveEffectiveTheme(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
}

export function applyTheme(): void {
  const effective = resolveEffectiveTheme(getThemePreference());
  document.documentElement.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective;
}

export function setThemePreference(pref: ThemePreference): void {
  if (pref === 'system') window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, pref);
  applyTheme();
}

// Keeps the app in sync with OS-level theme changes while the user is on
// 'system' (default) — ignored once they've picked light/dark manually.
let listenerAttached = false;
export function initThemeListener(): void {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme();
  });
}
