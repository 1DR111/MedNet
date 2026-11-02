'use client';

/**
 * Interactive Leaflet map of facilities.
 *
 * Leaflet reads `window` at import time, so this module must never be
 * evaluated on the server. Load it from a Client Component with:
 *
 *   const FacilityMap = dynamic(() => import('@/components/FacilityMap'), { ssr: false });
 *
 * The parent must give the component a height (via `className` or a sized
 * wrapper); Leaflet cannot lay out a map inside a zero-height container.
 */

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
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
const USER_ZOOM = 13;

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
    popupAnchor: [0, -size],
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
    popupAnchor: [0, -14],
  });
  iconCache.set('user', icon);
  return icon;
}

/** Styles for the div icons. Scoped by class so they never leak out of the map. */
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
  /** Initial centre; defaults to Abuja. */
  center?: [number, number];
  /** Initial zoom; defaults to city level. */
  zoom?: number;
  /** Applied to the wrapper. Must establish a height. */
  className?: string;
}

type MarkerRegistry = Map<string, L.Marker>;

export default function FacilityMap({
  facilities,
  selectedFacilityId = null,
  onSelectFacility,
  userLocation = null,
  center = ABUJA_CENTER,
  zoom = DEFAULT_ZOOM,
  className = 'h-[420px] w-full',
}: FacilityMapProps) {
  // Lets the controller open a marker's popup after flying to it.
  const markersRef = useRef<MarkerRegistry>(new Map());

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 ${className}`}>
      <style>{MARKER_CSS}</style>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {facilities.map((facility) => (
          <FacilityMarker
            key={facility.id}
            facility={facility}
            selected={facility.id === selectedFacilityId}
            onSelect={onSelectFacility}
            registry={markersRef}
          />
        ))}

        <MapController
          facilities={facilities}
          selectedFacilityId={selectedFacilityId}
          userLocation={userLocation}
          registry={markersRef}
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
  registry,
}: {
  facility: Facility;
  selected: boolean;
  onSelect?: (facility: Facility) => void;
  registry: RefObject<MarkerRegistry>;
}) {
  const icon = useMemo(() => getFacilityIcon(facility.type, selected), [facility.type, selected]);
  const eventHandlers = useMemo(
    () => ({ click: () => onSelect?.(facility) }),
    [facility, onSelect],
  );
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`;

  return (
    <Marker
      position={[facility.latitude, facility.longitude]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={eventHandlers}
      ref={(instance) => {
        if (instance) {
          registry.current.set(facility.id, instance);
        } else {
          registry.current.delete(facility.id);
        }
      }}
    >
      <Popup>
        <div className="min-w-[12rem] max-w-[16rem] text-sm text-slate-900">
          <p className="font-semibold leading-snug">{facility.name}</p>
          <p className="mt-0.5 text-xs font-medium" style={{ color: MARKER_COLORS[facility.type] }}>
            {TYPE_LABELS[facility.type]}
          </p>
          <p className="mt-1.5 text-xs text-slate-600">
            {facility.address}, {facility.city}
          </p>
          {(facility.is_open_24_7 || facility.has_emergency_services) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {facility.is_open_24_7 && (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-600/20">
                  Open 24/7
                </span>
              )}
              {facility.has_emergency_services && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                  Emergency services
                </span>
              )}
            </div>
          )}
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold !text-white hover:bg-emerald-700"
          >
            Get Directions
            <span className="sr-only"> to {facility.name} (opens in a new tab)</span>
          </a>
        </div>
      </Popup>
    </Marker>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Controller                                 */
/* -------------------------------------------------------------------------- */

/**
 * Lives inside the map so it can use `useMap()`. Flies to the selected
 * facility (then opens its popup), centres on the user when their location
 * first arrives, and renders the user-location marker.
 */
function MapController({
  facilities,
  selectedFacilityId,
  userLocation,
  registry,
}: {
  facilities: Facility[];
  selectedFacilityId: string | null;
  userLocation: [number, number] | null;
  registry: RefObject<MarkerRegistry>;
}) {
  const map = useMap();

  const selected = selectedFacilityId
    ? (facilities.find((facility) => facility.id === selectedFacilityId) ?? null)
    : null;
  const selectedLat = selected?.latitude;
  const selectedLng = selected?.longitude;

  // Fly to the selected facility; open its popup once the flight settles.
  // Depends on the coordinates, not the array, so re-filtering the list does
  // not re-trigger the animation.
  useEffect(() => {
    if (!selectedFacilityId || selectedLat === undefined || selectedLng === undefined) return;

    const openPopup = () => registry.current.get(selectedFacilityId)?.openPopup();
    // Register before flying: a flight to the current position ends synchronously.
    map.once('moveend', openPopup);
    map.flyTo([selectedLat, selectedLng], Math.max(map.getZoom(), SELECTED_ZOOM), {
      duration: 0.8,
    });

    return () => {
      map.off('moveend', openPopup);
    };
  }, [map, registry, selectedFacilityId, selectedLat, selectedLng]);

  // Centre on the patient when their location arrives and nothing is selected.
  const userLat = userLocation?.[0];
  const userLng = userLocation?.[1];
  useEffect(() => {
    if (userLat === undefined || userLng === undefined || selectedFacilityId) return;
    map.flyTo([userLat, userLng], Math.max(map.getZoom(), USER_ZOOM), { duration: 0.8 });
    // Only react to the location itself; a later selection must not re-centre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, userLat, userLng]);

  const userIcon = useMemo(() => getUserIcon(), []);

  if (!userLocation) return null;

  return (
    <Marker position={userLocation} icon={userIcon} zIndexOffset={2000}>
      <Popup>
        <span className="text-sm font-medium text-slate-900">Your location</span>
      </Popup>
    </Marker>
  );
}
