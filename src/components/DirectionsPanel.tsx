'use client';

import type { FormEvent, ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  MousePointerClick,
  Navigation,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { formatDistance } from '@/components/FacilityCard';
import {
  googleMapsDirectionsUrl,
  originCoords,
  originLabel,
  type AbujaPreset,
  type AddressSearchState,
  type GpsState,
  type Origin,
  type RouteState,
} from '@/lib/directions';
import { formatDriveTime, placeDetail, placeShortName, type GeocodedPlace } from '@/lib/routing';
import type { Facility } from '@/types/database';

/**
 * The in-app Directions view shown in the left panel: starting-point picker
 * (GPS, a typed address, Abuja landmarks or a map pin), destination with a
 * Google Maps hand-off, route summary and turn-by-turn steps. Presentational:
 * all state and handlers, the address search included, come from `useDirections`,
 * so nothing is lost when the phone sheet holding this panel closes.
 */
export interface DirectionsPanelProps {
  facility: Facility;
  origin: Origin | null;
  gps: GpsState;
  route: RouteState;
  presets: readonly AbujaPreset[];
  onClose: () => void;
  onUseGps: () => void;
  onRetryGps: () => void;
  onUsePreset: (presetId: string) => void;
  onUseAddress: (place: GeocodedPlace) => void;
  addressText: string;
  onAddressTextChange: (text: string) => void;
  addressSearch: AddressSearchState;
  onSearchAddress: (query: string) => void;
}

const ICON_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100';

const OPTION_BASE =
  'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';
const OPTION_ACTIVE =
  'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-100';
const OPTION_IDLE =
  'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800';

const AMBER_NOTICE =
  'flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200';

/** 16px on phones: smaller text makes iOS Safari zoom the page on focus. */
const ADDRESS_INPUT =
  'block w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-base text-slate-900 md:text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

const SEARCH_BUTTON =
  'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus-visible:ring-offset-slate-900';

const HANDOFF_BUTTON =
  'flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900';

/* -------------------------------------------------------------------------- */
/*                                    Panel                                   */
/* -------------------------------------------------------------------------- */

export default function DirectionsPanel({
  facility,
  origin,
  gps,
  route,
  presets,
  onClose,
  onUseGps,
  onRetryGps,
  onUsePreset,
  onUseAddress,
  addressText,
  onAddressTextChange,
  addressSearch,
  onSearchAddress,
}: DirectionsPanelProps) {
  const locating = gps.status === 'locating';
  const result = route.status === 'ready' ? route.result : null;
  const searching = addressSearch.status === 'searching';

  // The destination is always pre-filled; the starting point too, once known.
  const googleMapsUrl = googleMapsDirectionsUrl(
    [facility.latitude, facility.longitude],
    origin ? originCoords(origin) : gps.coords,
  );

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchAddress(addressText);
  }

  const gpsStatusText = locating
    ? 'Detecting your location...'
    : gps.status === 'found'
      ? origin?.kind === 'gps'
        ? 'Using your current position'
        : 'Position found, tap to use it'
      : gps.status === 'error'
        ? 'Location unavailable'
        : 'Uses your phone or browser location';

  return (
    <div className="pb-3">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <button type="button" onClick={onClose} className={ICON_BUTTON}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Close directions</span>
        </button>
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Navigation className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Directions
        </span>
        {/* Phones already have the sheet's own close button just above this header. */}
        <button type="button" onClick={onClose} title="Close directions" className={`${ICON_BUTTON} ml-auto max-md:hidden`}>
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Close directions</span>
        </button>
      </div>

      <div className="space-y-4 px-4 pt-3">
        {/* Starting point */}
        <section aria-labelledby="directions-origin">
          <SectionLabel id="directions-origin">Starting from</SectionLabel>
          <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
            {origin ? originLabel(origin) : locating ? 'Detecting your location...' : 'Choose a starting point'}
          </p>

          <div className="mt-2 flex items-stretch gap-2">
            <button
              type="button"
              onClick={onUseGps}
              aria-pressed={origin?.kind === 'gps'}
              disabled={locating}
              className={`${OPTION_BASE} ${origin?.kind === 'gps' ? OPTION_ACTIVE : OPTION_IDLE} disabled:cursor-wait`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {locating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LocateFixed className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Use My GPS</span>
                <span
                  className={`block text-xs ${
                    origin?.kind === 'gps'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {gpsStatusText}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={onRetryGps}
              disabled={locating}
              title="Detect my location again"
              className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium">Retry</span>
            </button>
          </div>

          {gps.status === 'error' && gps.error && (
            <p role="alert" className={`mt-2 ${AMBER_NOTICE}`}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{gps.error}</span>
            </p>
          )}

          {/* Typed address or area, geocoded within Abuja */}
          <form onSubmit={submitAddress} className="mt-3" aria-label="Search a starting address">
            <label htmlFor="directions-address" className="text-xs text-slate-500 dark:text-slate-400">
              Or start from an address, estate or area:
            </label>
            <div className="mt-1.5 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </span>
                <input
                  id="directions-address"
                  type="text"
                  value={addressText}
                  onChange={(event) => onAddressTextChange(event.target.value)}
                  placeholder="Enter starting address, estate, or area in Abuja..."
                  autoComplete="off"
                  enterKeyHint="search"
                  className={ADDRESS_INPUT}
                />
              </div>
              <button
                type="submit"
                disabled={searching || addressText.trim() === ''}
                className={SEARCH_BUTTON}
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
                Search
              </button>
            </div>

            {addressSearch.status === 'error' && addressSearch.error && (
              <p role="alert" className={`mt-2 ${AMBER_NOTICE}`}>
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{addressSearch.error}</span>
              </p>
            )}

            {addressSearch.status === 'done' && addressSearch.results.length === 0 && (
              <p role="status" className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                No matches in Abuja for &ldquo;{addressSearch.query}&rdquo;. Try an estate, street or
                district name.
              </p>
            )}

            {addressSearch.results.length > 0 && (
              <ul className="mt-2 space-y-1" aria-label="Matching locations">
                {addressSearch.results.map((place) => {
                  const active =
                    origin?.kind === 'address' &&
                    origin.place.lat === place.lat &&
                    origin.place.lng === place.lng;
                  const detail = placeDetail(place);
                  return (
                    <li key={`${place.displayName}:${place.lat},${place.lng}`}>
                      <button
                        type="button"
                        onClick={() => onUseAddress(place)}
                        aria-pressed={active}
                        className={`${OPTION_BASE} ${active ? OPTION_ACTIVE : OPTION_IDLE}`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{placeShortName(place)}</span>
                          {detail && (
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              {detail}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </form>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Or pick an Abuja landmark:</p>
          <div role="group" aria-label="Abuja landmarks" className="mt-1.5 grid grid-cols-2 gap-1.5">
            {presets.map((preset) => {
              const active = origin?.kind === 'preset' && origin.preset.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onUsePreset(preset.id)}
                  aria-pressed={active}
                  className={`rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    active ? OPTION_ACTIVE : OPTION_IDLE
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Or tap anywhere on the map to drop a starting pin.
              {origin?.kind === 'pin' && (
                <span className="font-medium text-emerald-700 dark:text-emerald-300"> Pin placed.</span>
              )}
            </span>
          </p>
        </section>

        {/* Destination */}
        <section aria-labelledby="directions-destination">
          <SectionLabel id="directions-destination">Destination</SectionLabel>
          <div className="mt-1.5 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{facility.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {facility.address}, {facility.city}
              </p>
            </div>
          </div>

          {/* Hand-off: the facility (and any chosen start) pre-filled in Google Maps */}
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className={`${HANDOFF_BUTTON} mt-2`}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open in Google Maps
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {origin
              ? `Starts navigation from ${originLabel(origin)} to ${facility.name}.`
              : `Starts navigation to ${facility.name}. Google Maps will ask for your location.`}
          </p>
        </section>

        {/* Route */}
        {route.status === 'loading' && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Finding the best road route...
          </div>
        )}

        {route.status === 'idle' && !origin && !locating && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Choose a starting point to see the route and turn-by-turn steps.
          </p>
        )}

        {result && (
          <section aria-labelledby="directions-route" className="space-y-3">
            <SectionLabel id="directions-route">Route</SectionLabel>

            {result.source === 'straight-line' && (
              <p role="status" className={AMBER_NOTICE}>
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  The routing service could not be reached, so this is a straight-line estimate.
                  Distance and drive time are approximate.
                </span>
              </p>
            )}

            <dl className="grid grid-cols-2 gap-2">
              <Metric label="Total distance" value={formatDistance(result.distanceKm)} />
              <Metric label="Estimated time" value={formatDriveTime(result.durationMinutes)} />
            </dl>

            <ol className="space-y-1" aria-label="Turn-by-turn steps">
              {result.steps.map((step, index) => (
                <li
                  key={`${index}-${step.instruction}`}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800 dark:text-slate-200">{step.instruction}</span>
                    {step.name && !step.instruction.includes(step.name) && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{step.name}</span>
                    )}
                  </span>
                  {step.distanceMeters > 0 && (
                    <span className="shrink-0 pt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatDistance(step.distanceMeters / 1000)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Sub-components                             */
/* -------------------------------------------------------------------------- */

function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {children}
    </h3>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}
