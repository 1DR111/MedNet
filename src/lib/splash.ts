/**
 * First-visit welcome screen flag, kept in `sessionStorage` under
 * `mednet_splash_dismissed`, so guests meet the welcome view once per browser
 * tab session and signed-in patients never do.
 *
 * Same store pattern as `coverage.ts`: `useSyncExternalStore`, with an
 * in-memory fallback when storage is blocked.
 */

import { useSyncExternalStore } from 'react';

export const SPLASH_DISMISSED_KEY = 'mednet_splash_dismissed';

let memory = false;
const listeners = new Set<() => void>();

/** Whether the welcome screen was dismissed in this tab session. */
export function readSplashDismissed(): boolean {
  if (memory) return true;
  try {
    return window.sessionStorage.getItem(SPLASH_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Hides the welcome screen for the rest of the tab session. */
export function dismissSplash(): void {
  memory = true;
  try {
    window.sessionStorage.setItem(SPLASH_DISMISSED_KEY, '1');
  } catch {
    // Keep the in-memory flag only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

/** `true` once dismissed in this tab session; `false` during server render. */
export function useSplashDismissed(): boolean {
  return useSyncExternalStore(subscribe, readSplashDismissed, getServerSnapshot);
}
