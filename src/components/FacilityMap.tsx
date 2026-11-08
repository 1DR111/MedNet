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
 * Pins are compact teardrops carrying the category's initial, coloured from
 * the shared `FACILITY_TYPE_INFO` table (the legend reads the same table).
 * At city zooms, pins that would overlap are grouped into cluster badges that
 * show a count; a click on one zooms in two levels. See `FacilityMarkers`.
 *
 * Directions: pass `activeRouteCoordinates` to draw the road route and fit it
 * into view, `originLocation` for a chosen starting point, `userLocation` for
 * the device position, and `onMapClick` plus `crosshair` while the user may
 * drop a starting pin.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import L, { type LeafletKeyboardEvent, type LeafletMouseEvent, type Map as LeafletMap } from 'leaflet';
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
import { FACILITY_TYPE_INFO } from '@/lib/facilities';
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

/** Pin box size (px). The letter inside stays large; the box does not. */
const PIN_SIZE = 28;
const PIN_SIZE_SELECTED = 34;
/**
 * How far the pin tip extends below its square icon box, as a fraction of
 * the box size: the square is rotated 45 degrees, so its sharp corner sits
 * (sqrt(2) - 1) / 2 of the size past the bottom edge.
 */
const PIN_TIP_OVERHANG = (Math.SQRT2 - 1) / 2;

/** Pins are grouped at this zoom and below; one level closer, every pin shows. */
export const CLUSTER_MAX_ZOOM = 13;
/** Pins closer than this (px) at the current zoom join one cluster. */
const CLUSTER_RADIUS = 42;
/** Cluster badge size (px). */
const CLUSTER_SIZE = 32;
/** Zoom levels a cluster click moves in by. */
const CLUSTER_ZOOM_STEP = 2;
const CLUSTER_COLOR = '#1e293b'; // slate-800
const CLUSTER_HOVER_COLOR = '#0f766e'; // teal-700, the brand mark

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

const USER_COLOR = '#2563eb'; // blue-600

/* -------------------------------------------------------------------------- */
/*                                    Icons                                   */
/* -------------------------------------------------------------------------- */

const iconCache = new Map<string, L.DivIcon>();

/**
 * Compact teardrop pin in the category colour with its initial inside,
 * enlarged with a tinted ring when selected.
 */
function getFacilityIcon(type: FacilityType, selected: boolean): L.DivIcon {
  const key = `${type}:${selected ? 'selected' : 'default'}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const size = selected ? PIN_SIZE_SELECTED : PIN_SIZE;
  const tip = Math.round(size * (1 + PIN_TIP_OVERHANG));
  const { color, initial } = FACILITY_TYPE_INFO[type];
  const icon = L.divIcon({
    className: 'mednet-marker',
    html: `<span class="mednet-pin${selected ? ' mednet-pin--selected' : ''}" style="--pin-color:${color};width:${size}px;height:${size}px;"><span class="mednet-pin__glyph">${initial}</span></span>`,
    iconSize: [size, size],
    // The pin tip (bottom centre after rotation) sits on the coordinate; the
    // tooltip opens above the round head.
    iconAnchor: [size / 2, tip],
    tooltipAnchor: [0, -tip],
  });

  iconCache.set(key, icon);
  return icon;
}

/** Rounded slate badge showing how many facilities it stands for. */
function getClusterIcon(count: number): L.DivIcon {
  const key = `cluster:${count}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: 'mednet-marker',
    html: `<span class="mednet-cluster">${count}</span>`,
    iconSize: [CLUSTER_SIZE, CLUSTER_SIZE],
    iconAnchor: [CLUSTER_SIZE / 2, CLUSTER_SIZE / 2],
    tooltipAnchor: [0, -CLUSTER_SIZE / 2],
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
 *
 * Pins and cluster badges keep their white border in both themes: on the
 * re-coloured dark tiles it is what separates them from the basemap.
 */
const MARKER_CSS = `
.mednet-marker { background: transparent; border: 0; }
.mednet-pin {
  position: relative;
  display: block;
  box-sizing: border-box;
  background: var(--pin-color);
  border: 2px solid #ffffff;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  transform-origin: 50% 50%;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.4);
  transition: box-shadow 150ms ease;
}
.mednet-pin--selected {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pin-color) 40%, transparent), 0 2px 6px rgba(15, 23, 42, 0.45);
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
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.3);
  user-select: none;
}
.mednet-pin--selected .mednet-pin__glyph { font-size: 15px; }
.mednet-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${CLUSTER_SIZE}px;
  height: ${CLUSTER_SIZE}px;
  box-sizing: border-box;
  border: 2px solid #ffffff;
  border-radius: 8px;
  background: ${CLUSTER_COLOR};
  color: #ffffff;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.4);
  transition: background-color 150ms ease;
  user-select: none;
}
.leaflet-marker-icon:hover .mednet-cluster,
.leaflet-marker-icon:focus-visible .mednet-cluster { background: ${CLUSTER_HOVER_COLOR}; }
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
/* Phones: keep the OpenStreetMap credit above the bottom navigation bar. */
@media (width < 48rem) {
  .leaflet-container .leaflet-bottom { bottom: 64px; }
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
  /** When set, taps on empty map (not on a marker) report their coordinates. */
  onMapClick?: (coords: [number, number]) => void;
  /** Shows a crosshair cursor, for when a tap will drop a starting pin. */
  crosshair?: boolean;
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
  crosshair = false,
  getFocusPadding,
  mapRef,
  center = ABUJA_CENTER,
  zoom = DEFAULT_ZOOM,
  className = 'h-full w-full',
}: FacilityMapProps) {
  const originIcon = useMemo(() => getOriginIcon(), []);
  const hasRoute = activeRouteCoordinates !== null && activeRouteCoordinates.length >= 2;

  return (
    <div className={`relative ${className} ${crosshair ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}>
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

        <FacilityMarkers
          facilities={facilities}
          selectedFacilityId={selectedFacilityId}
          onSelect={onSelectFacility}
          getFocusPadding={getFocusPadding}
        />

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
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/** A ref that always holds the latest `value`, for reading inside Leaflet handlers. */
function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/**
 * Click plus Enter and Space for a Leaflet marker. Leaflet gives every marker
 * `role="button"` and a tab stop but only forwards the key events, so without
 * this a keyboard user can reach a pin or badge and not open it.
 */
function activationHandlers(action: () => void) {
  return {
    click: action,
    keydown: (event: LeafletKeyboardEvent) => {
      const key = event.originalEvent.key;
      if (key !== 'Enter' && key !== ' ') return;
      event.originalEvent.preventDefault();
      action();
    },
  };
}

/**
 * Names a div-icon marker for assistive technology. Leaflet applies `alt`
 * only to image icons, so the label goes onto the element once it exists.
 * `DivIcon` reuses that element when the icon changes, and the `icon`
 * dependency re-applies the label either way.
 */
function useAccessibleName(label: string, icon: L.DivIcon): RefObject<L.Marker | null> {
  const markerRef = useRef<L.Marker | null>(null);
  useEffect(() => {
    markerRef.current?.getElement()?.setAttribute('aria-label', label);
  }, [label, icon]);
  return markerRef;
}

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
 * Flies to `target` at `maxZoom`, placing it in the centre of the map area
 * the floating UI leaves uncovered.
 */
function flyToTarget(
  map: LeafletMap,
  target: [number, number],
  maxZoom: number,
  getPadding: (() => FocusPadding) | undefined,
): void {
  const { topLeft, bottomRight } = clampPadding(map.getSize(), getPadding?.() ?? NO_PADDING);
  // A zero-size bounds plus `maxZoom` is how Leaflet centres a point with padding.
  map.flyToBounds(L.latLngBounds(target, target), {
    paddingTopLeft: topLeft,
    paddingBottomRight: bottomRight,
    maxZoom,
    duration: 0.8,
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Markers                                  */
/* -------------------------------------------------------------------------- */

/** What the map draws for the facilities at the current zoom. */
type MapItem =
  | { kind: 'pin'; facility: Facility }
  | { kind: 'cluster'; key: string; center: [number, number]; facilities: Facility[] };

/** A facility with its pixel position at the zoom being grouped. */
type Placed = { facility: Facility; point: L.Point };

/** Facilities drawn as one badge, with the running mean of their positions. */
type Group = { members: Placed[]; sum: L.Point; centre: L.Point };

function addToGroup(group: Group, member: Placed): void {
  group.members.push(member);
  group.sum = group.sum.add(member.point);
  group.centre = group.sum.divideBy(group.members.length);
}

/** The group whose centre is nearest to `point` within {@link CLUSTER_RADIUS}, if any. */
function nearestGroup(groups: Group[], point: L.Point, skip?: Group): Group | null {
  let best: Group | null = null;
  let bestDistance = CLUSTER_RADIUS;
  for (const group of groups) {
    if (group === skip || group.members.length === 0) continue;
    const distance = point.distanceTo(group.centre);
    if (distance <= bestDistance) {
      best = group;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Groups facilities whose pins would crowd each other at `zoom`: each
 * facility joins the group whose centre lies within {@link CLUSTER_RADIUS}
 * px of it (the nearest, if several), or starts a new one. A facility left
 * on its own because its neighbours only grouped up after it was placed then
 * joins the group that has since come within reach, so no lone pin sits
 * under a cluster badge. A group of one, or one holding the selected
 * facility, stays as individual pins so the chosen place is always on the
 * map.
 *
 * Pixel positions come from `map.project` at the given zoom. Distances
 * between them equal distances between `latLngToLayerPoint` results, but
 * they do not depend on where the layer origin sits during an animation.
 */
function groupFacilities(
  map: LeafletMap,
  facilities: Facility[],
  zoom: number,
  selectedFacilityId: string | null,
): MapItem[] {
  if (zoom > CLUSTER_MAX_ZOOM) {
    return facilities.map((facility) => ({ kind: 'pin', facility }));
  }

  const groups: Group[] = [];
  for (const facility of facilities) {
    const member: Placed = {
      facility,
      point: map.project([facility.latitude, facility.longitude], zoom),
    };
    const group = nearestGroup(groups, member.point);
    if (group) addToGroup(group, member);
    else groups.push({ members: [member], sum: member.point, centre: member.point });
  }

  // Each merge moves a centre, which can bring another lone pin into reach.
  let merged = true;
  while (merged) {
    merged = false;
    for (const lone of groups) {
      if (lone.members.length !== 1) continue;
      const group = nearestGroup(groups, lone.centre, lone);
      if (!group || group.members.length < 2) continue;
      addToGroup(group, lone.members[0]);
      lone.members = [];
      merged = true;
    }
  }

  const items: MapItem[] = [];
  for (const group of groups) {
    const members = group.members.map((member) => member.facility);
    if (members.length === 0) continue;
    if (members.length === 1 || members.some((facility) => facility.id === selectedFacilityId)) {
      members.forEach((facility) => items.push({ kind: 'pin', facility }));
      continue;
    }
    const centre = map.unproject(group.centre, zoom);
    items.push({
      kind: 'cluster',
      key: members
        .map((facility) => facility.id)
        .sort()
        .join('|'),
      center: [centre.lat, centre.lng],
      facilities: members,
    });
  }
  return items;
}

/**
 * Lives inside the map so it can read the zoom. Regroups the facilities
 * whenever the zoom, the list or the selection changes, and zooms in two
 * levels on a cluster click, keeping the cluster clear of the floating UI.
 */
function FacilityMarkers({
  facilities,
  selectedFacilityId,
  onSelect,
  getFocusPadding,
}: {
  facilities: Facility[];
  selectedFacilityId: string | null;
  onSelect?: (facility: Facility) => void;
  getFocusPadding?: () => FocusPadding;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  // A flight cut short by a drag ends with `moveend` only, leaving the map at
  // a fractional zoom without a `zoomend`, so the grouping resyncs on both.
  const zoomHandlers = useMemo(() => {
    const sync = () => setZoom(map.getZoom());
    return { zoomend: sync, moveend: sync };
  }, [map]);
  useMapEvents(zoomHandlers);
  const paddingRef = useLatestRef(getFocusPadding);

  const items = useMemo(
    () => groupFacilities(map, facilities, zoom, selectedFacilityId),
    [map, facilities, zoom, selectedFacilityId],
  );

  const zoomIntoCluster = useCallback(
    (center: [number, number]) => {
      // Rounded, so a click during another flight (when the zoom is
      // fractional) still lands on a whole level.
      flyToTarget(
        map,
        center,
        Math.min(Math.round(map.getZoom()) + CLUSTER_ZOOM_STEP, TILE_MAX_ZOOM),
        paddingRef.current,
      );
      // The badge unmounts once its pins split, so keyboard focus moves to
      // the map itself, where Leaflet's arrow-key panning takes over.
      map.getContainer().focus({ preventScroll: true });
    },
    [map, paddingRef],
  );

  return (
    <>
      {items.map((item) =>
        item.kind === 'pin' ? (
          <FacilityMarker
            key={item.facility.id}
            facility={item.facility}
            selected={item.facility.id === selectedFacilityId}
            onSelect={onSelect}
          />
        ) : (
          <ClusterMarker
            key={item.key}
            center={item.center}
            count={item.facilities.length}
            onZoomIn={zoomIntoCluster}
          />
        ),
      )}
    </>
  );
}

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
    () => activationHandlers(() => onSelect?.(facility)),
    [facility, onSelect],
  );
  const markerRef = useAccessibleName(
    `${facility.name}, ${FACILITY_TYPE_INFO[facility.type].label}`,
    icon,
  );

  return (
    <Marker
      ref={markerRef}
      position={[facility.latitude, facility.longitude]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={eventHandlers}
    >
      <Tooltip direction="top" className="mednet-tooltip" opacity={1}>
        {facility.name}
      </Tooltip>
    </Marker>
  );
}

/** A count badge standing in for several nearby pins; a click zooms in on them. */
function ClusterMarker({
  center,
  count,
  onZoomIn,
}: {
  center: [number, number];
  count: number;
  onZoomIn: (center: [number, number]) => void;
}) {
  const icon = useMemo(() => getClusterIcon(count), [count]);
  const eventHandlers = useMemo(
    () => activationHandlers(() => onZoomIn(center)),
    [center, onZoomIn],
  );
  const markerRef = useAccessibleName(`${count} facilities, zoom in to see them`, icon);

  return (
    <Marker
      ref={markerRef}
      position={center}
      icon={icon}
      zIndexOffset={500}
      eventHandlers={eventHandlers}
    >
      <Tooltip direction="top" className="mednet-tooltip" opacity={1}>
        {count} facilities · Zoom in to see them
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
  const paddingRef = useLatestRef(getFocusPadding);

  const flyWithPadding = useCallback(
    (target: [number, number], minZoom: number) => {
      flyToTarget(map, target, Math.max(map.getZoom(), minZoom), paddingRef.current);
    },
    [map, paddingRef],
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
  const userLocationRef = useLatestRef(userLocation);
  useEffect(() => {
    if (!userLocationRevision) return;
    const target = userLocationRef.current;
    if (!target) return;
    flyWithPadding(target, USER_ZOOM);
  }, [flyWithPadding, userLocationRef, userLocationRevision]);

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
  }, [map, paddingRef, activeRouteCoordinates]);

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
