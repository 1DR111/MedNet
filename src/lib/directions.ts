/**
 * In-app directions state: the destination facility, the starting point
 * (GPS, an Abuja landmark preset, a searched address, or a pin dropped on the
 * map) and the route.
 *
 * Everything is event-driven (no effects that set state), so the dashboard
 * can call the handlers from clicks, map taps and the geolocation callback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  geolocationErrorMessage,
  isInsideAbuja,
  requestPosition,
  type LatLng,
} from '@/lib/geolocation';
import { getRoute, placeShortName, type GeocodedPlace, type RouteResult } from '@/lib/routing';
import type { Facility } from '@/types/database';

/* --------------------------------- Presets -------------------------------- */

export interface AbujaPreset {
  id: string;
  name: string;
  coords: LatLng;
}

/**
 * Well-known Abuja starting points for desktop PCs without GPS. Coordinates
 * are the OpenStreetMap place nodes or approximate centres of each area,
 * enough to produce a realistic route.
 */
export const ABUJA_PRESETS: readonly AbujaPreset[] = [
  { id: 'galadimawa', name: 'Galadimawa', coords: [8.9847, 7.4306] },
  { id: 'nile-university', name: 'Nile University Area', coords: [9.0143, 7.399] },
  { id: 'wuse-2', name: 'Wuse 2', coords: [9.0765, 7.4898] },
  { id: 'garki', name: 'Garki', coords: [9.0333, 7.4918] },
  { id: 'cbd', name: 'Central Business District', coords: [9.058, 7.492] },
  { id: 'jabi', name: 'Jabi', coords: [9.064, 7.425] },
];

/** Network positioning first: quick on phones, and the only option on PCs. */
export const DIRECTIONS_GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

/* ---------------------------------- Types --------------------------------- */

export type Origin =
  | { kind: 'gps'; coords: LatLng }
  | { kind: 'preset'; preset: AbujaPreset }
  | { kind: 'address'; place: GeocodedPlace }
  | { kind: 'pin'; coords: LatLng };

export function originCoords(origin: Origin): LatLng {
  switch (origin.kind) {
    case 'preset':
      return origin.preset.coords;
    case 'address':
      return [origin.place.lat, origin.place.lng];
    default:
      return origin.coords;
  }
}

export function originLabel(origin: Origin): string {
  switch (origin.kind) {
    case 'gps':
      return 'My current location';
    case 'preset':
      return origin.preset.name;
    case 'address':
      return placeShortName(origin.place);
    case 'pin':
      return 'Pinned starting point';
  }
}

/**
 * Google Maps hand-off (Maps URLs API) with the facility pre-filled as the
 * destination and, when known, the chosen starting point as the origin.
 */
export function googleMapsDirectionsUrl(destination: LatLng, origin?: LatLng | null): string {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination[0]},${destination[1]}`;
  return origin ? `${url}&origin=${origin[0]},${origin[1]}` : url;
}

export interface GpsState {
  status: 'idle' | 'locating' | 'found' | 'error';
  /** Last known device position, kept across retries and closed panels. */
  coords: LatLng | null;
  error: string | null;
}

export interface RouteState {
  status: 'idle' | 'loading' | 'ready';
  result: RouteResult | null;
}

export interface Directions {
  /** Facility directions are being shown for; `null` when the panel is closed. */
  target: Facility | null;
  origin: Origin | null;
  gps: GpsState;
  route: RouteState;
  /** Opens directions to `facility`, locating the device if no origin is set. */
  start: (facility: Facility) => void;
  /** Closes the panel and clears the route; the starting point is remembered. */
  close: () => void;
  /** Starts from the device position, reusing a known fix or detecting one. */
  useGps: () => void;
  /** Detects the device position again, even if one is already known. */
  retryGps: () => void;
  usePreset: (presetId: string) => void;
  /** Starts from a location found by address search. */
  useAddress: (place: GeocodedPlace) => void;
  /** Starts from a point tapped on the map. */
  usePin: (coords: LatLng) => void;
}

const GPS_IDLE: GpsState = { status: 'idle', coords: null, error: null };

/* ---------------------------------- Hook ---------------------------------- */

export function useDirections(): Directions {
  const [target, setTarget] = useState<Facility | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [gps, setGps] = useState<GpsState>(GPS_IDLE);
  const [route, setRoute] = useState<RouteState>({ status: 'idle', result: null });

  // Mirrors of the latest values for async callbacks. Written only from event
  // handlers and promise callbacks, never during render.
  const targetRef = useRef<Facility | null>(null);
  const originRef = useRef<Origin | null>(null);
  const gpsRef = useRef<GpsState>(GPS_IDLE);
  const routeRequest = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });
  const gpsRequest = useRef(0);

  const commitTarget = useCallback((next: Facility | null) => {
    targetRef.current = next;
    setTarget(next);
  }, []);

  const commitOrigin = useCallback((next: Origin | null) => {
    originRef.current = next;
    setOrigin(next);
  }, []);

  const commitGps = useCallback((next: GpsState) => {
    gpsRef.current = next;
    setGps(next);
  }, []);

  const cancelRoute = useCallback(() => {
    routeRequest.current.controller?.abort();
    routeRequest.current = { id: routeRequest.current.id + 1, controller: null };
  }, []);

  const requestRoute = useCallback((from: LatLng, facility: Facility) => {
    routeRequest.current.controller?.abort();
    const controller = new AbortController();
    const id = routeRequest.current.id + 1;
    routeRequest.current = { id, controller };
    setRoute({ status: 'loading', result: null });

    getRoute(from, [facility.latitude, facility.longitude], controller.signal)
      .then((result) => {
        if (routeRequest.current.id !== id) return;
        setRoute({ status: 'ready', result });
      })
      .catch(() => {
        // Aborted: a newer request (or a close) replaced this one.
      });
  }, []);

  /** Drops any device fix still in flight (the user chose another origin). */
  const abandonLocating = useCallback(() => {
    gpsRequest.current += 1;
    const current = gpsRef.current;
    if (current.status === 'locating') {
      commitGps({ status: current.coords ? 'found' : 'idle', coords: current.coords, error: null });
    }
  }, [commitGps]);

  const locate = useCallback(() => {
    const id = ++gpsRequest.current;
    commitGps({ status: 'locating', coords: gpsRef.current.coords, error: null });

    requestPosition(DIRECTIONS_GPS_OPTIONS)
      .then((coords) => {
        if (gpsRequest.current !== id) return;
        if (!isInsideAbuja(coords)) {
          commitGps({
            status: 'error',
            coords: null,
            error: 'You appear to be outside Abuja. Choose an Abuja starting point below instead.',
          });
          return;
        }
        commitGps({ status: 'found', coords, error: null });
        commitOrigin({ kind: 'gps', coords });
        const facility = targetRef.current;
        if (facility) requestRoute(coords, facility);
      })
      .catch((error: unknown) => {
        if (gpsRequest.current !== id) return;
        commitGps({
          status: 'error',
          coords: gpsRef.current.coords,
          error: geolocationErrorMessage(error),
        });
      });
  }, [commitGps, commitOrigin, requestRoute]);

  const start = useCallback(
    (facility: Facility) => {
      commitTarget(facility);
      const currentOrigin = originRef.current;
      if (currentOrigin) {
        requestRoute(originCoords(currentOrigin), facility);
        return;
      }
      locate();
    },
    [commitTarget, locate, requestRoute],
  );

  const close = useCallback(() => {
    cancelRoute();
    commitTarget(null);
    setRoute({ status: 'idle', result: null });
  }, [cancelRoute, commitTarget]);

  const useGps = useCallback(() => {
    const known = gpsRef.current;
    if (known.status === 'found' && known.coords) {
      commitOrigin({ kind: 'gps', coords: known.coords });
      const facility = targetRef.current;
      if (facility) requestRoute(known.coords, facility);
      return;
    }
    locate();
  }, [commitOrigin, locate, requestRoute]);

  const retryGps = useCallback(() => {
    locate();
  }, [locate]);

  const usePreset = useCallback(
    (presetId: string) => {
      const preset = ABUJA_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) return;
      abandonLocating();
      commitOrigin({ kind: 'preset', preset });
      const facility = targetRef.current;
      if (facility) requestRoute(preset.coords, facility);
    },
    [abandonLocating, commitOrigin, requestRoute],
  );

  const useAddress = useCallback(
    (place: GeocodedPlace) => {
      abandonLocating();
      commitOrigin({ kind: 'address', place });
      const facility = targetRef.current;
      if (facility) requestRoute([place.lat, place.lng], facility);
    },
    [abandonLocating, commitOrigin, requestRoute],
  );

  const usePin = useCallback(
    (coords: LatLng) => {
      abandonLocating();
      commitOrigin({ kind: 'pin', coords });
      const facility = targetRef.current;
      if (facility) requestRoute(coords, facility);
    },
    [abandonLocating, commitOrigin, requestRoute],
  );

  // Abort anything still in flight when the dashboard unmounts.
  useEffect(() => cancelRoute, [cancelRoute]);

  return useMemo(
    () => ({
      target,
      origin,
      gps,
      route,
      start,
      close,
      useGps,
      retryGps,
      usePreset,
      useAddress,
      usePin,
    }),
    [target, origin, gps, route, start, close, useGps, retryGps, usePreset, useAddress, usePin],
  );
}
