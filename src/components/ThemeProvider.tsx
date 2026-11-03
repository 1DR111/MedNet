'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  DARK_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  isTheme,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme';

/**
 * Manages `theme` (`system` | `light` | `dark`) and the `resolvedTheme` that
 * is actually on screen.
 *
 * - `system` (the default when nothing is stored) follows the OS appearance
 *   and reacts to live OS changes.
 * - Manual choices persist to `localStorage` under `mednet_theme`.
 * - The `.dark` class, `data-theme` and `color-scheme` are kept on `<html>`.
 *   The inline script in the root layout applies them before first paint, so
 *   this provider only has to keep them in sync afterwards.
 */
interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ----------------------------- External stores ---------------------------- */

const storeListeners = new Set<() => void>();

function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function subscribeStoredTheme(listener: () => void): () => void {
  storeListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function subscribeSystemTheme(listener: () => void): () => void {
  const query = window.matchMedia(DARK_MEDIA_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function readSystemDark(): boolean {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

const noopSubscribe = () => () => {};

/* -------------------------------- Provider -------------------------------- */

export default function ThemeProvider({ children }: { children: ReactNode }) {
  // Server render and hydration see the defaults; the client values arrive
  // right after hydration without a state update inside an effect.
  const theme = useSyncExternalStore(subscribeStoredTheme, readStoredTheme, () => 'system' as const);
  const systemDark = useSyncExternalStore(subscribeSystemTheme, readSystemDark, () => false);
  // `false` until the client has hydrated, so the pre-paint script's choice
  // is never overwritten with the server defaults.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the change still applies for this page view.
    }
    storeListeners.forEach((listener) => listener());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyResolvedTheme(resolvedTheme);
  }, [hydrated, resolvedTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Current theme state; must be used under {@link ThemeProvider}. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.');
  return context;
}
