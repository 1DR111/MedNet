/**
 * Theme engine primitives shared by the inline boot script (root layout) and
 * the client-side ThemeProvider. Plain module: safe to import from Server
 * Components.
 */

export type Theme = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mednet_theme';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Toggles the `.dark` class, `data-theme` and `color-scheme` on `<html>`. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
}

/**
 * Runs in `<head>` before the first paint so the stored (or OS) theme is
 * applied with no flash. Mirrors {@link applyResolvedTheme}; keep in sync.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('${DARK_MEDIA_QUERY}').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.setAttribute('data-theme',d?'dark':'light');r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
