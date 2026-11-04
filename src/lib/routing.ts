/**
 * Road routing through the public OSRM demo server, with a straight-line
 * estimate as the fallback when the service cannot be reached, plus address
 * search (geocoding) through OpenStreetMap Nominatim, scoped to Abuja.
 *
 * Both services are free and keyless but shared and rate limited (Nominatim
 * allows one request per second); they suit the MVP, not heavy production
 * traffic.
 */

import { ABUJA_BOUNDS, haversineKm, isInsideAbuja, type LatLng } from '@/lib/geolocation';

export interface RouteStep {
  /** Human-readable instruction, e.g. "Turn left onto Ahmadu Bello Way". */
  instruction: string;
  /** Street name for this segment, when OSRM knows it. */
  name: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteResult {
  /** `osrm` for real road geometry; `straight-line` for the offline estimate. */
  source: 'osrm' | 'straight-line';
  distanceKm: number;
  durationMinutes: number;
  /** `[latitude, longitude]` pairs from origin to destination. */
  coordinates: LatLng[];
  steps: RouteStep[];
}

const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 12_000;
/** Typical Abuja driving speed; used only for the straight-line estimate. */
const FALLBACK_SPEED_KMH = 25;

/* ------------------------------ OSRM response ----------------------------- */

interface OsrmManeuver {
  type: string;
  modifier?: string;
  bearing_after?: number;
  exit?: number;
}

interface OsrmStep {
  distance: number;
  duration: number;
  name?: string;
  maneuver: OsrmManeuver;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { type: string; coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
}

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: OsrmRoute[];
}

/* --------------------------------- Public --------------------------------- */

/** The OSRM request for a driving route from `start` to `end`. */
export function osrmRouteUrl(start: LatLng, end: LatLng): string {
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;
  return `${OSRM_ENDPOINT}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;
}

/**
 * Fetches a road route from OSRM. Throws on network failure, timeout, a
 * non-OK OSRM code (such as `NoRoute`) or an abort of `signal`.
 */
export async function fetchOsrmRoute(
  start: LatLng,
  end: LatLng,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetch(osrmRouteUrl(start, end), { signal: controller.signal });
    if (!response.ok) throw new Error(`OSRM responded with HTTP ${response.status}`);

    const data = (await response.json()) as OsrmResponse;
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) {
      throw new Error(data.message || `OSRM returned ${data.code}`);
    }

    return parseOsrmRoute(route);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Converts one OSRM route into the app's shape. Exported for tests. */
export function parseOsrmRoute(route: OsrmRoute): RouteResult {
  const coordinates = route.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng]);
  const steps = route.legs.flatMap((leg) => leg.steps).map(toRouteStep);
  return {
    source: 'osrm',
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    coordinates,
    steps,
  };
}

/**
 * Straight-line estimate for when routing is unavailable: Haversine distance
 * and a drive time at a typical Abuja speed, with a two-step itinerary.
 */
export function straightLineRoute(start: LatLng, end: LatLng): RouteResult {
  const distanceKm = haversineKm(start, end);
  const durationMinutes = Math.max(1, Math.round((distanceKm / FALLBACK_SPEED_KMH) * 60));
  const heading = compassPoint(initialBearing(start, end)) ?? 'out';
  return {
    source: 'straight-line',
    distanceKm,
    durationMinutes,
    coordinates: [start, end],
    steps: [
      {
        instruction: `Head ${heading} toward your destination`,
        name: '',
        distanceMeters: distanceKm * 1000,
        durationSeconds: durationMinutes * 60,
      },
      { instruction: 'Arrive at your destination', name: '', distanceMeters: 0, durationSeconds: 0 },
    ],
  };
}

/**
 * The route to show: OSRM when it answers, otherwise the straight-line
 * estimate. Only an abort of `signal` is re-thrown, so a caller that replaced
 * this request can ignore it.
 */
export async function getRoute(start: LatLng, end: LatLng, signal?: AbortSignal): Promise<RouteResult> {
  try {
    return await fetchOsrmRoute(start, end, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return straightLineRoute(start, end);
  }
}

/** "12 min drive", "1 hr 5 min drive". */
export function formatDriveTime(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min drive`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} hr ${rest} min drive` : `${hours} hr drive`;
}

/* -------------------------------- Geocoding ------------------------------- */

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const GEOCODE_TIMEOUT_MS = 10_000;
const GEOCODE_LIMIT = 5;

/** A location found by address search. */
export interface GeocodedPlace {
  /** Full label, e.g. "Galadimawa, Municipal Area Council, Federal Capital Territory, Nigeria". */
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimRow {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

/**
 * The Nominatim request for `query`: the text is qualified with ", Abuja,
 * Nigeria", restricted to Nigeria and bounded to the FCT, so "Lokogoma" finds
 * the Abuja district rather than a namesake elsewhere.
 */
export function nominatimSearchUrl(query: string): string {
  const { minLat, maxLat, minLng, maxLng } = ABUJA_BOUNDS;
  const q = encodeURIComponent(`${query}, Abuja, Nigeria`);
  return `${NOMINATIM_ENDPOINT}?format=json&q=${q}&countrycodes=ng&limit=${GEOCODE_LIMIT}&viewbox=${minLng},${maxLat},${maxLng},${minLat}&bounded=1`;
}

/**
 * Finds up to five Abuja locations matching a typed address, estate or area
 * name. Resolves with an empty list when nothing matches; throws on network
 * failure, timeout, a non-OK response or an abort of `signal`.
 *
 * Nominatim's usage policy allows one request per second, so call this on an
 * explicit search (button or Enter), never per keystroke.
 */
export async function searchAbujaAddress(query: string, signal?: AbortSignal): Promise<GeocodedPlace[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const response = await fetch(nominatimSearchUrl(trimmed), { signal: controller.signal });
    if (!response.ok) throw new Error(`Nominatim responded with HTTP ${response.status}`);
    return parseNominatimResults(await response.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Converts Nominatim rows into places, dropping malformed rows, anything
 * outside Abuja and repeats of the same label (road segments often come back
 * several times). Exported for tests.
 */
export function parseNominatimResults(data: unknown): GeocodedPlace[] {
  if (!Array.isArray(data)) return [];
  const places: GeocodedPlace[] = [];
  const seen = new Set<string>();
  for (const row of data as Array<NominatimRow | null>) {
    const displayName = typeof row?.display_name === 'string' ? row.display_name.trim() : '';
    const lat = Number(row?.lat);
    const lng = Number(row?.lon);
    if (!displayName || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!isInsideAbuja([lat, lng])) continue;
    const place = { displayName, lat, lng };
    const label = `${placeShortName(place)}|${placeDetail(place)}`;
    if (seen.has(label)) continue;
    seen.add(label);
    places.push(place);
  }
  return places;
}

/** "Galadimawa" from "Galadimawa, Municipal Area Council, ...". */
export function placeShortName(place: GeocodedPlace): string {
  return place.displayName.split(',')[0]?.trim() || place.displayName;
}

/** The rest of the label after the short name, without the country and postcode. */
export function placeDetail(place: GeocodedPlace): string {
  return place.displayName
    .split(',')
    .slice(1)
    .map((part) => part.trim())
    .filter((part) => part && part !== 'Nigeria' && !/^\d{6}$/.test(part))
    .join(', ');
}

/* ------------------------------ Instructions ------------------------------ */

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

function compassPoint(bearing: number | undefined): string | null {
  if (typeof bearing !== 'number' || Number.isNaN(bearing)) return null;
  const normalised = ((bearing % 360) + 360) % 360;
  return COMPASS[Math.round(normalised / 45) % 8];
}

/** Initial bearing in degrees from `from` to `to`. */
function initialBearing([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

function sideWord(modifier: string | undefined): 'left' | 'right' | null {
  if (!modifier) return null;
  if (modifier.includes('left')) return 'left';
  if (modifier.includes('right')) return 'right';
  return null;
}

function turnPhrase(modifier: string | undefined): string {
  switch (modifier) {
    case 'uturn':
      return 'Make a U-turn';
    case 'sharp left':
      return 'Turn sharp left';
    case 'left':
      return 'Turn left';
    case 'slight left':
      return 'Keep slightly left';
    case 'straight':
      return 'Continue straight';
    case 'slight right':
      return 'Keep slightly right';
    case 'right':
      return 'Turn right';
    case 'sharp right':
      return 'Turn sharp right';
    default:
      return 'Continue';
  }
}

/** Builds a patient-friendly instruction from an OSRM maneuver. Exported for tests. */
export function describeManeuver(step: {
  name?: string;
  maneuver: { type: string; modifier?: string; bearing_after?: number; exit?: number };
}): string {
  const name = (step.name ?? '').trim();
  const onto = name ? ` onto ${name}` : '';
  const on = name ? ` on ${name}` : '';
  const { type, modifier, exit } = step.maneuver;
  const side = sideWord(modifier);

  switch (type) {
    case 'depart': {
      const heading = compassPoint(step.maneuver.bearing_after);
      return heading ? `Head ${heading}${on}` : `Head out${on}`;
    }
    case 'arrive':
      return side ? `Arrive at your destination, on the ${side}` : 'Arrive at your destination';
    case 'roundabout':
    case 'rotary':
      return typeof exit === 'number'
        ? `At the roundabout, take the ${ordinal(exit)} exit${onto}`
        : `Enter the roundabout${onto}`;
    case 'roundabout turn':
      return `At the roundabout, ${turnPhrase(modifier).toLowerCase()}${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout${onto}`;
    case 'turn':
    case 'end of road':
      return `${turnPhrase(modifier)}${onto}`;
    case 'merge':
      return side ? `Merge ${side}${onto}` : `Merge${onto}`;
    case 'on ramp':
      return side ? `Take the ramp on the ${side}${onto}` : `Take the ramp${onto}`;
    case 'off ramp':
      return side ? `Take the exit on the ${side}${onto}` : `Take the exit${onto}`;
    case 'fork':
      return `Keep ${side ?? 'straight'} at the fork${onto}`;
    case 'use lane':
      return `Use the ${side ?? 'middle'} lane${on}`;
    case 'new name':
    case 'continue':
    case 'notification':
    default:
      return modifier && modifier !== 'straight' ? `${turnPhrase(modifier)}${onto}` : `Continue${on}`;
  }
}

function toRouteStep(step: OsrmStep): RouteStep {
  return {
    instruction: describeManeuver(step),
    name: (step.name ?? '').trim(),
    distanceMeters: step.distance,
    durationSeconds: step.duration,
  };
}
