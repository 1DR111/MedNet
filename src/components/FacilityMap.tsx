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
 */

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import L, { type Map as LeafletMap } from 'leaflet';
import { AttributionControl, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
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
/** Smallest free width/height (px) kept for a flight target after padding. */
const MIN_FREE_AREA = 80;

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
  const color = MARKER_COLORS[type];
  const icon = L.divIcon({
    className: 'mednet-marker',
    html: `<span class="mednet-pin${selected ? ' mednet-pin--selected' : ''}" style="--pin-color:${color};width:${size}px;height:${size}px;"><span class="mednet-pin__glyph">${MARKER_GLYPHS[type]}</span></span>`,
    iconSize: [size, size],
    // The pin tip (bottom centre after rotation) is the anchor point.
    iconAnchor: [size / 2, size],
    tooltipAnchor: [0, -size],
  });

  iconCache.set(key, icon);
  return icon;
}

function getUserIcon(): L.DivIcon {
  const cached = iconCache.get('user');
  if (cached) return cached;
  const icon = L.divIcon({
    className: 'mednet-marker',
    html: `<span class="mednet-user" style="--user-color:${USER_COLOR}"><span class="mednet-user__pulse"></span><span class="mednet-user__dot"></span></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    tooltipAnchor: [0, -12],
  });
  iconCache.set('user', icon);
  return icon;
}

/** Styles for the div icons and tooltips. Scoped by class so they never leak out of the map. */
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
.mednet-pin__glyph {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(45deg);
  color: #fff;
  font: 700 0.42em/1 system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 46%;
}
.mednet-user { position: relative; display: block; width: 24px; height: 24px; }
.mednet-user__dot {
  position: absolute; inset: 5px; border-radius: 9999px;
  background: var(--user-color);
  box-shadow: 0 0 0 2px #fff, 0 1px 4px rgba(15, 23, 42, 0.4);
}
.mednet-user__pulse {
  position: absolute; inset: 0; border-radius: 9999px;
  background: var(--user-color); opacity: 0.35;
  animation: mednet-pulse 2s ease-out infinite;
}
@keyframes mednet-pulse {
  0% { transform: scale(0.6); opacity: 0.5; }
  100% { transform: scale(1.8); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .mednet-user__pulse { animation: none; opacity: 0.25; }
}
.leaflet-tooltip.mednet-tooltip {
  padding: 4px 10px;
  border: 0;
  border-radius: 9999px;
  background: #0f172a;
  color: #fff;
  font: 600 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
}
.leaflet-tooltip.mednet-tooltip::before { border-top-color: #0f172a; }
.leaflet-container .leaflet-control-attribution {
  border-radius: 9999px 9999px 0 0;
  padding: 2px 10px;
  font-size: 10px;
}
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
  /** The patient's `[latitude, longitude]`, shown as a blue dot when known. */
  userLocation?: [number, number] | null;
  /**
   * Bump this to fly to `userLocation` again even when the coordinates have
   * not changed (e.g. a second press of a "Locate me" button).
   */
  userLocationRevision?: number;
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
  userLocation = null,
  userLocationRevision = 0,
  getFocusPadding,
  mapRef,
  center = ABUJA_CENTER,
  zoom = DEFAULT_ZOOM,
  className = 'h-full w-full',
}: FacilityMapProps) {
  return (
    <div className={`relative ${className}`}>
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AttributionControl position="bottomleft" prefix={false} />

        {facilities.map((facility) => (
          <FacilityMarker
            key={facility.id}
            facility={facility}
            selected={facility.id === selectedFacilityId}
            onSelect={onSelectFacility}
          />
        ))}

        <MapController
          facilities={facilities}
          selectedFacilityId={selectedFacilityId}
          userLocation={userLocation}
          userLocationRevision={userLocationRevision}
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
 * facility, flies to the user when their location arrives (or is requested
 * again), and renders the user-location marker. Every flight asks
 * `getFocusPadding` for the floating UI footprint so the target lands in the
 * uncovered part of the map.
 */
function MapController({
  facilities,
  selectedFacilityId,
  userLocation,
  userLocationRevision,
  getFocusPadding,
}: {
  facilities: Facility[];
  selectedFacilityId: string | null;
  userLocation: [number, number] | null;
  userLocationRevision: number;
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
  // so re-filtering the list does not re-trigger the animation.
  useEffect(() => {
    if (!selectedFacilityId || selectedLat === undefined || selectedLng === undefined) return;
    flyWithPadding([selectedLat, selectedLng], SELECTED_ZOOM);
  }, [flyWithPadding, selectedFacilityId, selectedLat, selectedLng]);

  // Fly to the patient when their location arrives, and again on every
  // `userLocationRevision` bump (a repeat "Locate me" press).
  const userLat = userLocation?.[0];
  const userLng = userLocation?.[1];
  useEffect(() => {
    if (userLat === undefined || userLng === undefined) return;
    flyWithPadding([userLat, userLng], USER_ZOOM);
  }, [flyWithPadding, userLat, userLng, userLocationRevision]);

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
