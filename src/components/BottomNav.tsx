'use client';

import type { Ref } from 'react';
import { Clock, Map as MapIcon, Search, UserRound } from 'lucide-react';

/**
 * Phone-only bottom navigation. "Map" shows the full map; the other tabs
 * toggle their panel as a bottom sheet above this bar.
 */
export type MobileTab = 'map' | 'search' | 'recents' | 'profile';

/** Height (px) of the bar: sheets and floating controls sit above it. */
export const BOTTOM_NAV_HEIGHT = 64;

const TABS: readonly { id: MobileTab; label: string; icon: typeof MapIcon }[] = [
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'recents', label: 'Recents', icon: Clock },
  { id: 'profile', label: 'Profile', icon: UserRound },
];

export interface BottomNavProps {
  active: MobileTab;
  onSelect: (tab: MobileTab) => void;
  ref?: Ref<HTMLElement>;
}

export default function BottomNav({ active, onSelect, ref }: BottomNavProps) {
  return (
    <nav
      ref={ref}
      aria-label="Main"
      className="fixed bottom-0 left-0 z-[1000] h-16 w-full border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:hidden"
    >
      <ul className="grid h-full grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => {
          const current = id === active;
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-pressed={current}
                // The active tab is marked by an indicator line and weight as
                // well as colour, so it reads without colour vision.
                className={`flex h-full w-full flex-col items-center justify-center gap-1 border-t-2 text-xs transition-colors focus:outline-none focus-visible:bg-slate-100 dark:focus-visible:bg-slate-800 ${
                  current
                    ? 'border-emerald-600 font-semibold text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
                    : 'border-transparent font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
