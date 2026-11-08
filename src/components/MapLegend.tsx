'use client';

import { useId } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { FACILITY_TYPES, FACILITY_TYPE_INFO } from '@/lib/facilities';

/**
 * Key to the map pins: one row per facility category with its colour and
 * initial, plus the cluster badge. Collapses to a single "Legend" button.
 * The parent positions it and owns the open state, so the choice survives a
 * phone sheet opening and closing over it.
 *
 * The button comes first in the DOM and the panel is stacked above it with
 * `flex-col-reverse`, so a screen reader finds the key right after the
 * control that opened it.
 */
export interface MapLegendProps {
  open: boolean;
  onToggle: () => void;
  /**
   * True while `open` is still the screen-size default rather than the
   * patient's choice. The server renders for a wide, tall screen, so the
   * panel is then also hidden by CSS wherever that default would be closed,
   * and a phone never paints it before hydration.
   */
  followsScreen?: boolean;
  className?: string;
}

const SURFACE =
  'bg-white text-slate-900 shadow-lg ring-1 ring-slate-900/5 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10';

/** A 20px copy of a pin or cluster badge, with the letter or count inside. */
const SWATCH =
  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold leading-none text-white';

export default function MapLegend({ open, onToggle, followsScreen = false, className = '' }: MapLegendProps) {
  const panelId = useId();

  return (
    <div className={`flex flex-col-reverse items-start gap-2 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`flex h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-200 dark:hover:bg-slate-800 ${SURFACE}`}
      >
        <Layers className="h-4 w-4" aria-hidden="true" />
        Legend
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Map legend"
          // Capped so a legend opened by hand on a short screen scrolls
          // instead of running under the search box and chips.
          className={`w-48 max-h-[calc(100dvh-16.5rem)] overflow-y-auto rounded-lg p-3 ${SURFACE} ${
            followsScreen ? 'hidden md:tall:block' : ''
          }`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Map key
          </p>
          <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
            {FACILITY_TYPES.map((type) => {
              const info = FACILITY_TYPE_INFO[type];
              return (
                <li key={type} className="flex items-center gap-2">
                  <span aria-hidden="true" className={SWATCH} style={{ backgroundColor: info.color }}>
                    {info.initial}
                  </span>
                  <span>{info.plural}</span>
                </li>
              );
            })}
            <li className="flex items-center gap-2 border-t border-slate-100 pt-1.5 dark:border-slate-800">
              <span
                aria-hidden="true"
                className={`${SWATCH} bg-slate-800 ring-1 ring-inset ring-white/40 dark:bg-slate-700`}
              >
                5
              </span>
              <span>Several facilities, zoom in to see them</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
