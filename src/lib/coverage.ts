/**
 * Client-side mirror of the patient's HMO coverage, kept in `localStorage`
 * under `mednet_saved_hmo`.
 *
 * The database row in `patient_profiles` is the source of truth for signed-in
 * patients. This mirror makes the saved plan available instantly on the map
 * (before any network round trip) and lets guests keep a plan on this device.
 * Same storage pattern as `recents.ts`: `useSyncExternalStore`, with an
 * in-memory fallback when storage is blocked.
 */

import { useSyncExternalStore } from 'react';

export const SAVED_HMO_KEY = 'mednet_saved_hmo';

export interface SavedCoverage {
  has_hmo: boolean;
  hmo_id: string | null;
  hmo_plan_tier: string | null;
}

function isSavedCoverage(value: unknown): value is SavedCoverage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.has_hmo === 'boolean' &&
    (candidate.hmo_id === null || typeof candidate.hmo_id === 'string') &&
    (candidate.hmo_plan_tier === null || typeof candidate.hmo_plan_tier === 'string')
  );
}

/* --------------------------------- Storage -------------------------------- */

let memory: string | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    const raw = window.localStorage.getItem(SAVED_HMO_KEY);
    if (raw !== null) return raw;
  } catch {
    // Storage unavailable; use the in-memory copy.
  }
  return memory;
}

function writeRaw(raw: string | null): void {
  memory = raw;
  try {
    if (raw === null) window.localStorage.removeItem(SAVED_HMO_KEY);
    else window.localStorage.setItem(SAVED_HMO_KEY, raw);
  } catch {
    // Keep the in-memory copy only.
  }
  listeners.forEach((listener) => listener());
}

let snapshot: { raw: string | null; value: SavedCoverage | null } = { raw: null, value: null };

/** Parsed coverage, or `null` when nothing valid is stored. Stable per raw string. */
export function readSavedCoverage(): SavedCoverage | null {
  const raw = readRaw();
  if (snapshot.raw === raw) return snapshot.value;
  let value: SavedCoverage | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      value = isSavedCoverage(parsed) ? parsed : null;
    } catch {
      value = null;
    }
  }
  snapshot = { raw, value };
  return value;
}

export function writeSavedCoverage(coverage: SavedCoverage): void {
  writeRaw(
    JSON.stringify({
      has_hmo: coverage.has_hmo,
      hmo_id: coverage.has_hmo ? coverage.hmo_id : null,
      hmo_plan_tier: coverage.has_hmo ? coverage.hmo_plan_tier : null,
    }),
  );
}

export function clearSavedCoverage(): void {
  writeRaw(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function getServerSnapshot(): null {
  return null;
}

/** The mirrored coverage on this device. `null` during server render. */
export function useSavedCoverage(): SavedCoverage | null {
  return useSyncExternalStore(subscribe, readSavedCoverage, getServerSnapshot);
}
