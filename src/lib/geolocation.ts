/**
 * Browser geolocation helpers for the Abuja map.
 *
 * Pure functions plus a promise wrapper around `navigator.geolocation`, so
 * any flow (for example an in-app "Get Directions" step) can locate the
 * patient, check they are in Abuja, fall back to a central point and compute
 * distances without re-implementing the details.
 */

export type LatLng = [number, number];

/** Generous bounding box around the Federal Capital Territory. */
export const ABUJA_BOUNDS = { minLat: 8.3, maxLat: 9.4, minLng: 6.7, maxLng: 7.9 };

/** Wuse II, central Abuja: the one-click fallback when geolocation fails. */
export const CENTRAL_ABUJA: LatLng = [9.0765, 7.4898];

/**
 * First attempt: network/Wi-Fi positioning. Desktop PCs have no GPS, and a
 * high-accuracy request there just waits out the timeout.
 */
export const QUICK_FIX: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 300_000,
};

/** Retry: GPS where available. */
export const PRECISE_FIX: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 0,
};

export function isInsideAbuja([lat, lng]: LatLng): boolean {
  return (
    lat >= ABUJA_BOUNDS.minLat &&
    lat <= ABUJA_BOUNDS.maxLat &&
    lng >= ABUJA_BOUNDS.minLng &&
    lng <= ABUJA_BOUNDS.maxLng
  );
}

/** Great-circle distance in kilometres. */
export function haversineKm([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/** Thrown by {@link requestPosition} when the browser has no geolocation API. */
export class GeolocationUnsupportedError extends Error {
  constructor() {
    super('This browser does not support location services.');
    this.name = 'GeolocationUnsupportedError';
  }
}

/** Patient-facing wording for a failed position request. */
export function geolocationErrorMessage(error: unknown): string {
  if (error instanceof GeolocationUnsupportedError) {
    return 'Your browser does not support location services. You can use a central Abuja location instead.';
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as GeolocationPositionError;
    switch (code) {
      case 1: // PERMISSION_DENIED
        return 'Location access was denied. Allow location in your browser settings, or use a central Abuja location instead.';
      case 2: // POSITION_UNAVAILABLE
        return 'Your location could not be determined. Desktop PCs often have no GPS, so you can use a central Abuja location instead.';
      case 3: // TIMEOUT
        return 'Finding your location took too long. Retry with GPS, or use a central Abuja location instead.';
      default:
        break;
    }
  }
  return 'Something went wrong while finding your location. You can use a central Abuja location instead.';
}

/**
 * Resolves with the device position as `[latitude, longitude]`. Rejects with
 * a `GeolocationPositionError`, or {@link GeolocationUnsupportedError} when
 * the API is missing.
 */
export function requestPosition(options: PositionOptions): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new GeolocationUnsupportedError());
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      reject,
      options,
    );
  });
}
