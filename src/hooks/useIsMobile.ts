import { useState, useEffect } from 'react';

// Matches the layout breakpoint used elsewhere for mobile/desktop split
// (see ChatPage.tsx) — kept as a single reactive source so components can
// branch on it without duplicating the width check or missing live resizes
// (e.g. DevTools device toolbar toggling without a reload).
const BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}
