import { useSyncExternalStore } from 'react';

/** Whether a media query matches now, following it as the window changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
}

/** Tablet and up (Tailwind's `md`, 48rem): side menu instead of the bottom bar. */
export const WIDE_SCREEN = '(min-width: 48rem)';

export const useWideScreen = () => useMediaQuery(WIDE_SCREEN);
