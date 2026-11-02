/**
 * Recently viewed facilities and recent searches, kept in `localStorage`.
 *
 * Reads go through `useSyncExternalStore`: the server render and the hydration
 * pass see an empty list, then the client swaps in the stored one without a
 * `setState` inside an effect. When storage is unavailable (private mode,
 * blocked site data) an in-memory copy keeps the feature working for the
 * session.
 */

import { useSyncExternalStore } from 'react';
import type { FacilityType } from '@/types/database';

export const RECENT_FACILITIES_KEY = 'mednet_recent_facilities';
export const RECENT_SEARCHES_KEY = 'mednet_recent_searches';
/** Newest first; older entries fall off. */
export const MAX_RECENT_ITEMS = 5;

/** Snapshot of a facility the patient opened, enough to render a recents row. */
export interface RecentFacility {
  id: string;
  name: string;
  type: FacilityType;
  address: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Validation                                */
/* -------------------------------------------------------------------------- */

const FACILITY_TYPES: readonly string[] = ['hospital', 'clinic', 'pharmacy', 'laboratory'];

function isRecentFacility(value: unknown): value is RecentFacility {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.address === 'string' &&
    typeof candidate.type === 'string' &&
    FACILITY_TYPES.includes(candidate.type)
  );
}

function isRecentSearch(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/* -------------------------------------------------------------------------- */
/*                                   Storage                                  */
/* -------------------------------------------------------------------------- */

/** Fallback when `localStorage` throws or is empty for a key. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) return raw;
  } catch {
    // Storage unavailable; fall through to the in-memory copy.
  }
  return memory.get(key) ?? null;
}

function writeRaw(key: string, raw: string | null): void {
  if (raw === null) memory.delete(key);
  else memory.set(key, raw);

  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
  } catch {
    // Keep the in-memory copy only.
  }

  listeners.forEach((listener) => listener());
}

function parseList<T>(raw: string | null, isItem: (value: unknown) => value is T): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem).slice(0, MAX_RECENT_ITEMS) : [];
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Snapshots                                 */
/* -------------------------------------------------------------------------- */

const EMPTY: never[] = [];
/** `useSyncExternalStore` needs a stable value per unchanged raw string. */
const snapshotCache = new Map<string, { raw: string | null; list: unknown[] }>();

function getSnapshot<T>(key: string, isItem: (value: unknown) => value is T): T[] {
  const raw = readRaw(key);
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.list as T[];
  const list = parseList(raw, isItem);
  snapshotCache.set(key, { raw, list });
  return list;
}

function getServerSnapshot(): never[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Other tabs write through the `storage` event.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/* -------------------------------------------------------------------------- */
/*                                    Hooks                                   */
/* -------------------------------------------------------------------------- */

/** Facilities the patient opened, newest first. Empty during server render. */
export function useRecentFacilities(): RecentFacility[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(RECENT_FACILITIES_KEY, isRecentFacility),
    getServerSnapshot,
  );
}

/** Search terms the patient submitted, newest first. Empty during server render. */
export function useRecentSearches(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(RECENT_SEARCHES_KEY, isRecentSearch),
    getServerSnapshot,
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Writers                                  */
/* -------------------------------------------------------------------------- */

/** Moves (or adds) a facility to the top of the recently viewed list. */
export function rememberFacility(facility: RecentFacility): void {
  const current = getSnapshot(RECENT_FACILITIES_KEY, isRecentFacility);
  const next = [facility, ...current.filter((item) => item.id !== facility.id)].slice(
    0,
    MAX_RECENT_ITEMS,
  );
  writeRaw(RECENT_FACILITIES_KEY, JSON.stringify(next));
}

/** Drops a facility from the recently viewed list, e.g. when it no longer exists. */
export function forgetFacility(facilityId: string): void {
  const current = getSnapshot(RECENT_FACILITIES_KEY, isRecentFacility);
  const next = current.filter((item) => item.id !== facilityId);
  writeRaw(RECENT_FACILITIES_KEY, next.length ? JSON.stringify(next) : null);
}

/** Moves (or adds) a search term to the top of the recent searches list. */
export function rememberSearch(query: string): void {
  const term = query.trim();
  if (!term) return;
  const current = getSnapshot(RECENT_SEARCHES_KEY, isRecentSearch);
  const next = [
    term,
    ...current.filter((item) => item.toLowerCase() !== term.toLowerCase()),
  ].slice(0, MAX_RECENT_ITEMS);
  writeRaw(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

/** Clears both recents lists. */
export function clearRecents(): void {
  writeRaw(RECENT_FACILITIES_KEY, null);
  writeRaw(RECENT_SEARCHES_KEY, null);
}
