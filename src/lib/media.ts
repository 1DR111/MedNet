/**
 * Viewport breakpoints as React state, so components can choose between
 * phone and desktop structure (not just styling) without hydration mismatches.
 */

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Tailwind `md`, in the unit Tailwind compiles it to (48rem), so the JS and
 * CSS breakpoints agree whatever the browser's root font size. From here the
 * discovery screen is a desktop layout (sidebar beside the map); below it,
 * phones use a bottom navigation bar and sheets.
 */
export const DESKTOP_QUERY = '(min-width: 48rem)';

/**
 * Viewports tall enough for the open map legend to clear the search box and
 * chips. Mirrors the `tall` custom variant in globals.css.
 */
export const TALL_QUERY = '(min-height: 36rem)';

/**
 * Whether `query` currently matches. During server rendering and hydration it
 * reports `serverFallback`, then switches to the real value on the client.
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => serverFallback, [serverFallback]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
