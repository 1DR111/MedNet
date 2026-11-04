'use client';

/**
 * Interactive Leaflet map of facilities, styled to sit full-bleed behind
 * floating UI (search box, drawer, controls) the way Google Maps does.
 *
 * Leaflet reads `window` at import time, so this module must never be
 * evaluated on the server. Load it from a Client Component with:
 *
 *   const FacilityMap = dynamic(() => import('@/components/FacilityMap'), { ssr: false });
 *
 * The parent must give the component a height (via `className` or a sized
 * wrapper); Leaflet cannot lay out a map inside a zero-height container.
 *
 * Leaflet's own zoom control is disabled: the parent renders its own buttons
 * and drives the map through `mapRef` (`zoomIn()`, `zoomOut()`, `flyTo()`).
 *
 * Tiles always come from the standard OpenStreetMap server, which needs no
 * API key. Dark mode is handled in `globals.css`: the tile pane is
 * re-coloured with a CSS filter under `.dark`, and the marker, tooltip and
 * attribution colours below adapt with the same class.
 *
 * Directions: pass `activeRouteCoordinates` to draw the road route and fit it
 * into view, `originLocation` for a chosen starting point, `userLocation` for
 * the device position, and `onMapClick` while the user may drop a starting pin.
 */

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import L, { type LeafletMouseEvent, type Map as LeafletMap } from 'leaflet';
import {
  AttributionControl,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Facility, FacilityType } from '@/types/database';

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

/** Abuja city centre. */
export const ABUJA_CENTER: [number, number] = [9.0645, 7.466];
export const DEFAULT_ZOOM = 12;
/** Zoom used when flying to a selected facility, unless already closer. */
const SELECTED_ZOOM = 15;
/** Zoom used when centring on the user's location, unless already closer. */
const USER_ZOOM = 14;
/** Closest the map zooms when fitting a whole route into view. */
const ROUTE_MAX_ZOOM = 16;
/** Extra breathing room (px) around a fitted route, beyond the floating UI. */
const ROUTE_PADDING = 24;
/** Smallest free width/height (px) kept for a flight target after padding. */
const MIN_FREE_AREA = 80;
/**
 * How far the pin tip extends below its square icon box, as a fraction of
 * the box size: the square is rotated 45 degrees, so its sharp corner sits
 * (sqrt(2) - 1) / 2 of the size past the bottom edge.
 */
const PIN_TIP_OVERHANG = (Math.SQRT2 - 1) / 2;

/** Standard OpenStreetMap raster tiles: free, no key, 19 zoom levels. */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const TILE_MAX_ZOOM = 19;

/** Route line: clinical teal, drawn over a theme-aware casing for contrast. */
const ROUTE_COLOR = '#0d9488';
const ROUTE_WEIGHT = 5;
const ROUTE_OPACITY = 0.9;

/**
 * Screen areas, in pixels, covered by floating UI. Flights place their target
 * in the centre of what remains, so a selected pin never ends up under the
 * drawer or the search box.
 */
export interface FocusPadding {
  /** `[left, top]` */
  topLeft: [number, number];
  /** `[right, bottom]` */
  bottomRight: [number, number];
}

const NO_PADDING: FocusPadding = { topLeft: [0, 0], bottomRight: [0, 0] };

const TYPE_LABELS: Record<FacilityType, string> = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
};

/** Marker colour per facility type (Tailwind 600 shades). */
const MARKER_COLORS: Record<FacilityType, string> = {
  hospital: '#059669', // emerald-600
  clinic: '#0d9488', // teal-600
  pharmacy: '#7c3aed', // violet-600
  laboratory: '#d97706', // amber-600
};

/** Single-letter glyph shown inside each pin. */
const MARKER_GLYPHS: Record<FacilityType, string> = {
  hospital: 'H',
  clinic: 'C',
  pharmacy: 'P',
  laboratory: 'L',
};

const USER_COLOR = '#2563eb'; // blue-600

/* -------------------------------------------------------------------------- */
/*                                    Icons                                   */
/* -------------------------------------------------------------------------- */

const iconCache = new Map<string, L.DivIcon>();

/** Teardrop pin coloured by facility type, enlarged with a ring when selected. */
function getFacilityIcon(type: FacilityType, selected: boolean): L.DivIcon {
  const key = `${type}:${selected ? 'selected' : 'default'}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const size = selected ? 40 : 30;
  const tip = Math.round(size * (1 + PIN_TIP_OVERHANG));
  const color = MARKER_COLORS[type];
  const icon = L.divIcon({
    className: 'mednet-marker',
    html: `<span class="mednet-pin${selected ? ' mednet-pin--selected' : ''}" style="--pin-color:${color};width:${size}px;height:${size}px;"><span class="mednet-pin__glyph">${MARKER_GLYPHS[type]}</span></span>`,
    iconSize: [size, size],
    // The pin tip (bottom centre after rotation) sits on the coordinate; the
    // tooltip opens above the round head.
    iconAnchor: [size / 2, tip],
    tooltipAnchor: [0, -tip],
  });

  iconCache.set(key, icon);
  return icon;
}

function getUserIcon(): L.DivIcon {
  const cached = iconCache.get('user');
  if (cached) return cached;
  const icon = L.divIcon({
    className: 'mednet-marker',
    html: `<span class="mednet-user" style="--user-color:${USER_COLOR}"><span class="mednet-user__halo"></span><span class="mednet-user__dot"></span></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    tooltipAnchor: [0, -12],
  });
  iconCache.set('user', icon);
  return icon;
}

/** Teal disc for a chosen starting point (landmark preset or dropped pin). */
function getOriginIcon(): L.DivIcon {
  const cached = iconCache.get('origin');
  if (cached) return cached;
  const icon = L.divIcon({
    className: 'mednet-marker',
    html: '<span class="mednet-origin"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    tooltipAnchor: [0, -12],
  });
  iconCache.set('origin', icon);
  return icon;
}

/**
 * Styles for the div icons, tooltips, route casing and attribution in both
 * themes. Scoped by class so they never leak out of the map. The `.dark`
 * rules key off the class the theme engine keeps on `<html>`.
 */
const MARKER_CSS = `
.mednet-marker { background: transparent; border: 0; }
.mednet-pin {
  position: relative;
  display: block;
  background: var(--pin-color);
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  transform-origin: 50% 50%;
  box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(15, 23, 42, 0.35);
  transition: box-shadow 150ms ease, transform 150ms ease;
}
.mednet-pin--selected {
  box-shadow: 0 0 0 3px #fff, 0 0 0 7px color-mix(in srgb, var(--pin-color) 45%, transparent), 0 4px 10px rgba(15, 23, 42, 0.4);
}
.dark .mednet-pin { box-shadow: 0 0 0 2px #0f172a, 0 2px 6px rgba(0, 0, 0, 0.6); }
.dark .mednet-pin--selected {
  box-shadow: 0 0 0 3px #0f172a, 0 0 0 7px color-mix(in srgb, var(--pin-color) 55%, transparent), 0 4px 10px rgba(0, 0, 0, 0.7);
}
.mednet-pin__glyph {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(45deg);
  color: #ffffff;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.3);
  user-select: none;
}
.mednet-pin--selected .mednet-pin__glyph { font-size: 15px; }
.mednet-user { position: relative; display: block; width: 24px; height: 24px; }
.mednet-user__dot {
  position: absolute; inset: 5px; border-radius: 9999px;
  background: var(--user-color);
  box-shadow: 0 0 0 2px #fff, 0 1px 4px rgba(15, 23, 42, 0.4);
}
.dark .mednet-user__dot { box-shadow: 0 0 0 2px #0f172a, 0 1px 4px rgba(0, 0, 0, 0.6); }
.mednet-user__halo {
  position: absolute; inset: 0; border-radius: 9999px;
  background: var(--user-color); opacity: 0.25;
}
.mednet-origin {
  position: relative; display: block; width: 22px; height: 22px; border-radius: 9999px;
  background: ${ROUTE_COLOR};
  box-shadow: 0 0 0 3px #fff, 0 2px 6px rgba(15, 23, 42, 0.35);
}
.mednet-origin::after {
  content: ''; position: absolute; inset: 7px; border-radius: 9999px; background: #fff;
}
.dark .mednet-origin { box-shadow: 0 0 0 3px #0f172a, 0 2px 6px rgba(0, 0, 0, 0.6); }
.mednet-route-casing { stroke: #ffffff; }
.dark .mednet-route-casing { stroke: #0f172a; }
.leaflet-tooltip.mednet-tooltip {
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background: #0f172a;
  color: #fff;
  font: 600 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
}
.leaflet-tooltip.mednet-tooltip::before { border-top-color: #0f172a; }
.dark .leaflet-tooltip.mednet-tooltip {
  background: #f1f5f9;
  color: #0f172a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
.dark .leaflet-tooltip.mednet-tooltip::before { border-top-color: #f1f5f9; }
.leaflet-container .leaflet-control-attribution {
  border-radius: 6px 6px 0 0;
  padding: 2px 10px;
  font-size: 10px;
}
.dark .leaflet-container .leaflet-control-attribution {
  background: rgba(2, 6, 23, 0.85);
  color: #94a3b8;
}
.dark .leaflet-container .leaflet-control-attribution a { color: #cbd5e1; }
`;

/* -------------------------------------------------------------------------- */
/*                                  Component                                 */
/* -------------------------------------------------------------------------- */

export interface FacilityMapProps {
  facilities: Facility[];
  /** Marker to highlight and fly to. */
  selectedFacilityId?: string | null;
  /** Called when a marker is clicked. */
  onSelectFacility?: (facility: Facility) => void;
  /**
   * Skip the flight to the selected facility (for example while a route is
   * being fetched, so the map does not fly twice).
   */
  holdSelectionFlight?: boolean;
  /** The device position as `[latitude, longitude]`, shown as a blue dot when known. */
  userLocation?: [number, number] | null;
  /**
   * Bump this to centre the map on `userLocation` (it never recentres on its
   * own when the coordinates change).
   */
  userLocationRevision?: number;
  /** A chosen starting point other than the device position. */
  originLocation?: { position: [number, number]; label: string } | null;
  /** Road route to draw and fit into view, as `[latitude, longitude]` pairs. */
  activeRouteCoordinates?: [number, number][] | null;
  /**
   * When set, taps on empty map (not on a marker) report their coordinates
   * and the cursor becomes a crosshair, so the user can drop a starting pin.
   */
  onMapClick?: (coords: [number, number]) => void;
  /**
   * Returns the floating UI footprint at the moment of a flight, so the
   * target lands in the uncovered part of the map. Measuring on demand keeps
   * it correct as the drawer opens, closes or wraps.
   */
  getFocusPadding?: () => FocusPadding;
  /** Receives the Leaflet map instance so the parent can drive zoom and flights. */
  mapRef?: RefObject<LeafletMap | null>;
  /** Initial centre; defaults to Abuja. */
  center?: [number, number];
  /** Initial zoom; defaults to city level. */
  zoom?: number;
  /** Applied to the wrapper. Must establish a height. */
  className?: string;
}

export default function FacilityMap({
  facilities,
  selectedFacilityId = null,
  onSelectFacility,
  holdSelectionFlight = false,
  userLocation = null,
  userLocationRevision = 0,
  originLocation = null,
  activeRouteCoordinates = null,
  onMapClick,
  getFocusPadding,
  mapRef,
  center = ABUJA_CENTER,
  zoom = DEFAULT_ZOOM,
  className = 'h-full w-full',
}: FacilityMapProps) {
  const originIcon = useMemo(() => getOriginIcon(), []);
  const hasRoute = activeRouteCoordinates !== null && activeRouteCoordinates.length >= 2;

  return (
    <div className={`relative ${className} ${onMapClick ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}>
      <style>{MARKER_CSS}</style>
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={zoom}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={TILE_MAX_ZOOM} />
        <AttributionControl position="bottomleft" prefix={false} />

        {hasRoute && (
          <>
            <Polyline
              positions={activeRouteCoordinates}
              pathOptions={{
                className: 'mednet-route-casing',
                weight: ROUTE_WEIGHT + 4,
                opacity: ROUTE_OPACITY,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false,
              }}
            />
            <Polyline
              positions={activeRouteCoordinates}
              pathOptions={{
                color: ROUTE_COLOR,
                weight: ROUTE_WEIGHT,
                opacity: ROUTE_OPACITY,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false,
              }}
            />
          </>
        )}

        {facilities.map((facility) => (
          <FacilityMarker
            key={facility.id}
            facility={facility}
            selected={facility.id === selectedFacilityId}
            onSelect={onSelectFacility}
          />
        ))}

        {originLocation && (
          <Marker
            position={originLocation.position}
            icon={originIcon}
            zIndexOffset={1500}
            alt={originLocation.label}
          >
            <Tooltip direction="top" className="mednet-tooltip" opacity={1}>
              {originLocation.label}
            </Tooltip>
          </Marker>
        )}

        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        <MapController
          facilities={facilities}
          selectedFacilityId={selectedFacilityId}
          holdSelectionFlight={holdSelectionFlight}
          userLocation={userLocation}
          userLocationRevision={userLocationRevision}
          activeRouteCoordinates={hasRoute ? activeRouteCoordinates : null}
          getFocusPadding={getFocusPadding}
        />
      </MapContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Markers                                  */
/* -------------------------------------------------------------------------- */

function FacilityMarker({
  facility,
  selected,
  onSelect,
}: {
  facility: Facility;
  selected: boolean;
  onSelect?: (facility: Facility) => void;
}) {
  const icon = useMemo(() => getFacilityIcon(facility.type, selected), [facility.type, selected]);
  const eventHandlers = useMemo(
    () => ({ click: () => onSelect?.(facility) }),
    [facility, onSelect],
  );

  return (
    <Marker
      position={[facility.latitude, facility.longitude]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={eventHandlers}
      alt={`${facility.name}, ${TYPE_LABELS[facility.type]}`}
    >
      <Tooltip direction="top" className="mednet-tooltip" opacity={1}>
        {facility.name}
      </Tooltip>
    </Marker>
  );
}

/** Reports taps on empty map. Marker clicks do not bubble to the map, so pins stay selectable. */
function MapClickHandler({ onMapClick }: { onMapClick: (coords: [number, number]) => void }) {
  const handlers = useMemo(
    () => ({
      click: (event: LeafletMouseEvent) => onMapClick([event.latlng.lat, event.latlng.lng]),
    }),
    [onMapClick],
  );
  useMapEvents(handlers);
  return null;
}

/* -------------------------------------------------------------------------- */
/*                                 Controller                                 */
/* -------------------------------------------------------------------------- */

/**
 * Shrinks padding that would leave less than {@link MIN_FREE_AREA} px of map,
 * so a small viewport (or one not yet laid out) never yields a NaN zoom.
 */
function clampPadding(size: L.Point, padding: FocusPadding): FocusPadding {
  const clampAxis = (total: number, start: number, end: number): [number, number] => {
    const covered = start + end;
    if (covered === 0 || total - covered >= MIN_FREE_AREA) return [start, end];
    const scale = Math.max(0, total - MIN_FREE_AREA) / covered;
    return [Math.floor(start * scale), Math.floor(end * scale)];
  };
  const [left, right] = clampAxis(size.x, padding.topLeft[0], padding.bottomRight[0]);
  const [top, bottom] = clampAxis(size.y, padding.topLeft[1], padding.bottomRight[1]);
  return { topLeft: [left, top], bottomRight: [right, bottom] };
}

/**
 * Lives inside the map so it can use `useMap()`. Flies to the selected
 * facility, fits an active route into view, centres on the user on request,
 * and renders the user-location marker. Every movement asks `getFocusPadding`
 * for the floating UI footprint so the target lands in the uncovered part of
 * the map.
 */
function MapController({
  facilities,
  selectedFacilityId,
  holdSelectionFlight,
  userLocation,
  userLocationRevision,
  activeRouteCoordinates,
  getFocusPadding,
}: {
  facilities: Facility[];
  selectedFacilityId: string | null;
  holdSelectionFlight: boolean;
  userLocation: [number, number] | null;
  userLocationRevision: number;
  activeRouteCoordinates: [number, number][] | null;
  getFocusPadding?: () => FocusPadding;
}) {
  const map = useMap();

  // Latest measurer, read at flight time. Declared before the flight effects so
  // it is already current when they run; a new function alone never flies.
  const paddingRef = useRef(getFocusPadding);
  useEffect(() => {
    paddingRef.current = getFocusPadding;
  }, [getFocusPadding]);

  const flyWithPadding = useCallback(
    (target: [number, number], minZoom: number) => {
      const { topLeft, bottomRight } = clampPadding(
        map.getSize(),
        paddingRef.current?.() ?? NO_PADDING,
      );
      // A zero-size bounds plus `maxZoom` is how Leaflet centres a point with padding.
      map.flyToBounds(L.latLngBounds(target, target), {
        paddingTopLeft: topLeft,
        paddingBottomRight: bottomRight,
        maxZoom: Math.max(map.getZoom(), minZoom),
        duration: 0.8,
      });
    },
    [map],
  );

  const selected = selectedFacilityId
    ? (facilities.find((facility) => facility.id === selectedFacilityId) ?? null)
    : null;
  const selectedLat = selected?.latitude;
  const selectedLng = selected?.longitude;

  // Fly to the selected facility. Depends on the coordinates, not the array,
  // so re-filtering the list does not re-trigger the animation. Held while a
  // route is active, and runs again when the hold lifts (directions closed).
  useEffect(() => {
    if (holdSelectionFlight) return;
    if (!selectedFacilityId || selectedLat === undefined || selectedLng === undefined) return;
    flyWithPadding([selectedLat, selectedLng], SELECTED_ZOOM);
  }, [flyWithPadding, holdSelectionFlight, selectedFacilityId, selectedLat, selectedLng]);

  // Centre on the patient only when explicitly asked (a revision bump), not
  // whenever their coordinates change.
  const userLocationRef = useRef(userLocation);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);
  useEffect(() => {
    if (!userLocationRevision) return;
    const target = userLocationRef.current;
    if (!target) return;
    flyWithPadding(target, USER_ZOOM);
  }, [flyWithPadding, userLocationRevision]);

  // Fit the whole route into the uncovered part of the map.
  useEffect(() => {
    if (!activeRouteCoordinates) return;
    const base = paddingRef.current?.() ?? NO_PADDING;
    const { topLeft, bottomRight } = clampPadding(map.getSize(), {
      topLeft: [base.topLeft[0] + ROUTE_PADDING, base.topLeft[1] + ROUTE_PADDING],
      bottomRight: [base.bottomRight[0] + ROUTE_PADDING, base.bottomRight[1] + ROUTE_PADDING],
    });
    map.fitBounds(L.latLngBounds(activeRouteCoordinates), {
      paddingTopLeft: topLeft,
      paddingBottomRight: bottomRight,
      maxZoom: ROUTE_MAX_ZOOM,
    });
  }, [map, activeRouteCoordinates]);

  const userIcon = useMemo(() => getUserIcon(), []);

  if (!userLocation) return null;

  return (
    <Marker position={userLocation} icon={userIcon} zIndexOffset={2000} alt="Your location">
      <Tooltip direction="top" className="mednet-tooltip" opacity={1}>
        Your location
      </Tooltip>
    </Marker>
  );
}
