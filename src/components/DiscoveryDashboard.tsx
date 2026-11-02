'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Map as LeafletMap } from 'leaflet';
import {
  AlertCircle,
  Ambulance,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  Globe,
  HeartPulse,
  Info,
  Loader2,
  LocateFixed,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Minus,
  Navigation,
  Phone,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { HmoCompatibility, TYPE_META, formatDistance } from '@/components/FacilityCard';
import type { FocusPadding } from '@/components/FacilityMap';
import FilterBar, { EMPTY_FILTERS } from '@/components/FilterBar';
import {
  filterFacilities,
  findHmoMatch,
  type FacilityFilters,
  type FacilityWithHMO,
} from '@/lib/facilities';
import {
  clearRecents,
  forgetFacility,
  rememberFacility,
  rememberSearch,
  useRecentFacilities,
  useRecentSearches,
  type RecentFacility,
} from '@/lib/recents';
import { createClient } from '@/lib/supabase/client';
import type { Facility, Hmo, PatientProfile } from '@/types/database';

/* -------------------------------------------------------------------------- */
/*                               Map (client-only)                            */
/* -------------------------------------------------------------------------- */

// Leaflet touches `window` at import time, so the map is never server-rendered.
const FacilityMap = dynamic(() => import('@/components/FacilityMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading map"
      className="flex h-full w-full animate-pulse flex-col items-center justify-center gap-3 bg-slate-200 text-sm text-slate-500"
    >
      <MapPin className="h-8 w-8 text-slate-400" aria-hidden="true" />
      Loading map…
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

/** Generous bounding box around the Federal Capital Territory. */
const ABUJA_BOUNDS = { minLat: 8.3, maxLat: 9.4, minLng: 6.7, maxLng: 7.9 };

/** Wuse II, central Abuja: the one-click fallback when geolocation fails. */
export const CENTRAL_ABUJA: [number, number] = [9.0765, 7.4898];

/**
 * First attempt: network/Wi-Fi positioning. Desktop PCs have no GPS, and a
 * high-accuracy request there just waits out the timeout.
 */
const QUICK_FIX: PositionOptions = { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 };
/** Retry: GPS where available. */
const PRECISE_FIX: PositionOptions = { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 };

const DRAWER_ID = 'discovery-drawer';
/** Tailwind `sm`: from here the drawer sits beside the map instead of over its top. */
const DESKTOP_QUERY = '(min-width: 640px)';
/** Breathing room (px) between floating UI and a flight target. */
const FOCUS_GUTTER = 16;
/** Height (px) of the bottom band on phones: locate/zoom controls and toasts. */
const MOBILE_BOTTOM_UI = 140;

const BOX_WIDTH = 'w-[360px] max-w-[calc(100vw-2rem)] sm:w-[400px]';

type Notice = {
  tone: 'info' | 'success' | 'error';
  message: string;
  /** Show the "Use Central Abuja Location (Wuse II)" button. */
  offerFallback?: boolean;
  /** Show a "Retry with GPS" button. */
  offerRetry?: boolean;
  /** Never auto-dismiss. */
  sticky?: boolean;
} | null;

type DrawerMode = 'details' | 'idle' | 'results';

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function initialFiltersFor(profile: PatientProfile | null): FacilityFilters {
  if (profile?.has_hmo && profile.hmo_id) {
    return { ...EMPTY_FILTERS, hmoId: profile.hmo_id, planTier: profile.hmo_plan_tier ?? null };
  }
  return { ...EMPTY_FILTERS };
}

function filtersEqual(a: FacilityFilters, b: FacilityFilters): boolean {
  return (
    (a.searchQuery ?? '').trim() === (b.searchQuery ?? '').trim() &&
    (a.facilityType ?? 'all') === (b.facilityType ?? 'all') &&
    (a.hmoId ?? null) === (b.hmoId ?? null) &&
    (a.planTier ?? null) === (b.planTier ?? null) &&
    (a.only24Hours === true) === (b.only24Hours === true) &&
    (a.onlyEmergency === true) === (b.onlyEmergency === true)
  );
}

/** "Hospitals · Leadway Health Pro · Open 24/7". */
function describeFilters(filters: FacilityFilters, hmos: Hmo[]): string {
  const parts: string[] = [];
  const type = filters.facilityType ?? 'all';
  if (type !== 'all') parts.push(`${TYPE_META[type].label}s`);
  const hmoName = filters.hmoId ? hmos.find((hmo) => hmo.id === filters.hmoId)?.name : null;
  if (hmoName || filters.planTier) {
    parts.push([hmoName ?? 'Any HMO', filters.planTier ?? ''].filter(Boolean).join(' '));
  }
  if (filters.only24Hours) parts.push('Open 24/7');
  if (filters.onlyEmergency) parts.push('Emergency');
  return parts.join(' · ');
}

function isInsideAbuja([lat, lng]: [number, number]): boolean {
  return (
    lat >= ABUJA_BOUNDS.minLat &&
    lat <= ABUJA_BOUNDS.maxLat &&
    lng >= ABUJA_BOUNDS.minLng &&
    lng <= ABUJA_BOUNDS.maxLng
  );
}

/** Great-circle distance in kilometres. */
function haversineKm([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location access was denied. Allow location in your browser settings, or use a central Abuja location instead.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location could not be determined. Desktop PCs often have no GPS, so you can use a central Abuja location instead.';
    case error.TIMEOUT:
      return 'Finding your location took too long. Retry with GPS, or use a central Abuja location instead.';
    default:
      return 'Something went wrong while finding your location. You can use a central Abuja location instead.';
  }
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

function toRecent(facility: Pick<Facility, 'id' | 'name' | 'type' | 'address'>): RecentFacility {
  return { id: facility.id, name: facility.name, type: facility.type, address: facility.address };
}

/* -------------------------------------------------------------------------- */
/*                                  Component                                 */
/* -------------------------------------------------------------------------- */

export interface DiscoveryDashboardProps {
  initialFacilities: FacilityWithHMO[];
  hmos: Hmo[];
  patientProfile: PatientProfile | null;
}

export default function DiscoveryDashboard({
  initialFacilities,
  hmos,
  patientProfile,
}: DiscoveryDashboardProps) {
  const router = useRouter();

  const baselineFilters = useMemo(() => initialFiltersFor(patientProfile), [patientProfile]);

  const [filters, setFilters] = useState<FacilityFilters>(baselineFilters);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationRevision, setLocationRevision] = useState(0);
  const [locating, setLocating] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const recentFacilities = useRecentFacilities();
  const recentSearches = useRecentSearches();

  const mapRef = useRef<LeafletMap | null>(null);
  /** The top-left stack: search box, chips and drawer. */
  const clusterRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  /* ------------------------------- Derived data ---------------------------- */

  // Annotate with distance and sort nearest-first once the patient is located.
  const facilities = useMemo(() => {
    if (!userLocation) return initialFacilities;
    return initialFacilities
      .map((facility) => ({
        ...facility,
        distance_km: haversineKm(userLocation, [facility.latitude, facility.longitude]),
      }))
      .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
  }, [initialFacilities, userLocation]);

  const visibleFacilities = useMemo(() => filterFacilities(facilities, filters), [facilities, filters]);

  const selectedFacility = selectedFacilityId
    ? (facilities.find((facility) => facility.id === selectedFacilityId) ?? null)
    : null;

  // The map always shows the selected facility, even if the filters hide it
  // (e.g. opened from "Recent").
  const mapFacilities = useMemo(() => {
    if (!selectedFacility || visibleFacilities.some((facility) => facility.id === selectedFacility.id)) {
      return visibleFacilities;
    }
    return [...visibleFacilities, selectedFacility];
  }, [visibleFacilities, selectedFacility]);

  const hasQuery = (filters.searchQuery ?? '').trim() !== '';
  // "Idle" means nothing is actively narrowed: either no filters at all, or
  // just the patient's saved plan applied by default.
  const isIdle =
    !hasQuery && (filtersEqual(filters, baselineFilters) || filtersEqual(filters, EMPTY_FILTERS));
  const drawerMode: DrawerMode = selectedFacility ? 'details' : isIdle ? 'idle' : 'results';

  const profileHmo = patientProfile?.hmo_id
    ? (hmos.find((hmo) => hmo.id === patientProfile.hmo_id) ?? null)
    : null;
  const activeHmo = filters.hmoId ? (hmos.find((hmo) => hmo.id === filters.hmoId) ?? null) : null;

  /**
   * Measures the floating UI when the map is about to fly, so the target
   * stays visible beside the drawer (wider screens) or below the search
   * cluster (phones), whatever their current height.
   */
  const getFocusPadding = useCallback((): FocusPadding => {
    const cluster = clusterRef.current?.getBoundingClientRect();
    const drawer = drawerRef.current;
    const drawerRect = drawer && !drawer.hidden ? drawer.getBoundingClientRect() : null;
    const clusterBottom = (cluster?.bottom ?? 0) + FOCUS_GUTTER;

    if (window.matchMedia(DESKTOP_QUERY).matches) {
      if (drawerRect) {
        return {
          topLeft: [drawerRect.right + FOCUS_GUTTER, FOCUS_GUTTER],
          bottomRight: [FOCUS_GUTTER, FOCUS_GUTTER],
        };
      }
      return { topLeft: [FOCUS_GUTTER, clusterBottom], bottomRight: [FOCUS_GUTTER, FOCUS_GUTTER] };
    }
    return { topLeft: [0, clusterBottom], bottomRight: [0, MOBILE_BOTTOM_UI] };
  }, []);

  /* -------------------------------- Effects -------------------------------- */

  // Start each drawer view at the top.
  useEffect(() => {
    drawerRef.current?.scrollTo({ top: 0 });
  }, [drawerMode, selectedFacilityId]);

  // Plain confirmations fade out; errors and anything with an action stay.
  useEffect(() => {
    if (!notice || notice.tone === 'error' || notice.offerFallback || notice.offerRetry || notice.sticky) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /* ------------------------------ Interactions ----------------------------- */

  const selectFacility = useCallback((facility: Pick<Facility, 'id' | 'name' | 'type' | 'address'>) => {
    setSelectedFacilityId(facility.id);
    setDrawerOpen(true);
    rememberFacility(toRecent(facility));
  }, []);

  function openRecentFacility(recent: RecentFacility) {
    const facility = facilities.find((candidate) => candidate.id === recent.id);
    if (facility) {
      selectFacility(facility);
      return;
    }
    forgetFacility(recent.id);
    setNotice({ tone: 'info', message: `${recent.name} is no longer listed, so it was removed from your recents.` });
  }

  function applyFilters(next: FacilityFilters) {
    setFilters(next);
    // Changing a filter returns to the list, like Google Maps.
    setSelectedFacilityId(null);
  }

  function submitSearch(query: string) {
    if (query) rememberSearch(query);
    setSelectedFacilityId(null);
    setDrawerOpen(true);
  }

  function applyRecentSearch(query: string) {
    rememberSearch(query);
    applyFilters({ ...filters, searchQuery: query });
  }

  function resetFilters() {
    applyFilters({ ...EMPTY_FILTERS });
  }

  function applyLocation(coords: [number, number], message: string) {
    setUserLocation(coords);
    setLocationRevision((revision) => revision + 1);
    setNotice({ tone: 'success', message });
  }

  function useCentralAbuja() {
    applyLocation(
      CENTRAL_ABUJA,
      'Using Central Abuja (Wuse II) as your location. Facilities are sorted by distance from there.',
    );
  }

  function requestPosition(options: PositionOptions) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setNotice({
        tone: 'error',
        message: 'Your browser does not support location services. You can use a central Abuja location instead.',
        offerFallback: true,
      });
      return;
    }

    setLocating(true);
    setNotice({ tone: 'info', message: 'Finding your location…', sticky: true });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setLocating(false);

        if (!isInsideAbuja(coords)) {
          setNotice({
            tone: 'info',
            message:
              'You appear to be outside Abuja. MedNet lists Abuja facilities only; use a central Abuja location to sort them by distance.',
            offerFallback: true,
          });
          return;
        }

        applyLocation(coords, 'Location found. Facilities are now sorted by distance from you.');
      },
      (error) => {
        setLocating(false);
        setNotice({
          tone: 'error',
          message: geolocationErrorMessage(error),
          offerFallback: true,
          // A quick network fix that timed out may still succeed with GPS.
          offerRetry: !options.enableHighAccuracy && error.code !== error.PERMISSION_DENIED,
        });
      },
      options,
    );
  }

  function locateMe() {
    requestPosition(QUICK_FIX);
  }

  function retryWithGps() {
    requestPosition(PRECISE_FIX);
  }

  function clearLocation() {
    setUserLocation(null);
    setNotice(null);
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      setNotice({ tone: 'error', message: `Could not sign out: ${error.message}` });
      return;
    }
    // Drop profile-derived filters so a signed-out visitor sees everything.
    setFilters({ ...EMPTY_FILTERS });
    setSelectedFacilityId(null);
    setSigningOut(false);
    router.refresh();
  }

  /* --------------------------------- Render -------------------------------- */

  const accountMenu = (variant: 'pill' | 'compact') => (
    <AccountMenu
      variant={variant}
      profile={patientProfile}
      hmo={profileHmo}
      signingOut={signingOut}
      onSignOut={signOut}
    />
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-200 text-slate-900 supports-[height:100dvh]:h-dvh">
      {/* Map: fills the viewport; `isolate` keeps Leaflet's z-indexes beneath the floating UI. */}
      <div className="absolute inset-0 z-0 isolate">
        <FacilityMap
          facilities={mapFacilities}
          selectedFacilityId={selectedFacilityId}
          onSelectFacility={selectFacility}
          userLocation={userLocation}
          userLocationRevision={locationRevision}
          getFocusPadding={getFocusPadding}
          mapRef={mapRef}
          className="h-full w-full"
        />
      </div>

      {/* Top-left: search, chips, drawer */}
      <div
        ref={clusterRef}
        className="pointer-events-none absolute left-4 top-4 z-[1000] flex max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        <FilterBar
          filters={filters}
          onFilterChange={applyFilters}
          hmos={hmos}
          patientProfile={patientProfile}
          onSearchSubmit={submitSearch}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((open) => !open)}
          drawerId={DRAWER_ID}
          trailing={
            <div className="flex items-center gap-1 sm:hidden">
              <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />
              {accountMenu('compact')}
            </div>
          }
        />

        <section
          ref={drawerRef}
          id={DRAWER_ID}
          hidden={!drawerOpen}
          aria-label={
            drawerMode === 'details'
              ? 'Facility details'
              : drawerMode === 'results'
                ? 'Search results'
                : 'Recent and nearby facilities'
          }
          className={`pointer-events-auto max-h-[min(40vh,20rem)] overflow-y-auto rounded-2xl bg-white/95 shadow-xl ring-1 ring-slate-900/5 backdrop-blur sm:max-h-[calc(100vh-140px)] ${BOX_WIDTH}`}
        >
          {drawerMode === 'details' && selectedFacility ? (
            <PlaceDetails
              facility={selectedFacility}
              activeHmoId={filters.hmoId}
              activePlanTier={filters.planTier}
              onBack={() => setSelectedFacilityId(null)}
            />
          ) : drawerMode === 'idle' ? (
            <>
              <RecentsSection
                searches={recentSearches}
                facilities={recentFacilities}
                onSearch={applyRecentSearch}
                onOpenFacility={openRecentFacility}
                onClear={clearRecents}
              />
              <div className="border-t border-slate-100">
                <DrawerHeading
                  title="Verified in Abuja"
                  count={visibleFacilities.length}
                  subtitle={
                    activeHmo
                      ? `Matching your ${activeHmo.name}${filters.planTier ? ` ${filters.planTier}` : ''} plan`
                      : userLocation
                        ? 'Sorted by distance from you'
                        : 'All verified facilities, A to Z'
                  }
                />
                <FacilityList
                  facilities={visibleFacilities}
                  filters={filters}
                  selectedFacilityId={selectedFacilityId}
                  onSelect={selectFacility}
                  onReset={resetFilters}
                />
              </div>
            </>
          ) : (
            <div>
              <DrawerHeading
                title={`${visibleFacilities.length} ${visibleFacilities.length === 1 ? 'result' : 'results'}`}
                subtitle={
                  [hasQuery ? `“${filters.searchQuery?.trim()}”` : '', describeFilters(filters, hmos)]
                    .filter(Boolean)
                    .join(' · ') || 'Matching your filters'
                }
                action={
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear all
                  </button>
                }
              />
              <FacilityList
                facilities={visibleFacilities}
                filters={filters}
                selectedFacilityId={selectedFacilityId}
                onSelect={selectFacility}
                onReset={resetFilters}
              />
            </div>
          )}
        </section>
      </div>

      {/* Top-right: account */}
      <div className="absolute right-4 top-4 z-[1000] hidden sm:block">{accountMenu('pill')}</div>

      {/* Bottom-left: brand (only where it cannot collide with the toast) */}
      <Link
        href="/"
        className="absolute bottom-8 left-4 z-[1000] hidden items-center gap-2 rounded-full bg-white/95 py-1.5 pl-1.5 pr-3 text-sm shadow-lg ring-1 ring-slate-900/5 backdrop-blur lg:flex"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
          <HeartPulse className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="font-semibold">MedNet</span>
        <span className="text-xs text-slate-500">Verified Healthcare Discovery · Abuja</span>
      </Link>

      {/* Bottom-right: locate + zoom */}
      <div className="absolute bottom-6 right-4 z-[1000] flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          aria-pressed={userLocation !== null}
          title={userLocation ? 'Re-centre on your location' : 'Show your location'}
          className={`flex h-11 w-11 items-center justify-center rounded-full shadow-lg ring-1 ring-slate-900/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait ${
            userLocation
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-white text-slate-700 hover:bg-slate-50 hover:text-emerald-700'
          }`}
        >
          {locating ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="sr-only">{locating ? 'Finding your location' : 'Locate me'}</span>
        </button>

        <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-900/5">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom in"
            className="flex h-11 w-11 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-emerald-50"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Zoom in</span>
          </button>
          <span className="mx-2 h-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom out"
            className="flex h-11 w-11 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-emerald-50"
          >
            <Minus className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Zoom out</span>
          </button>
        </div>
      </div>

      {/* Toast */}
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`absolute bottom-6 left-4 right-[4.5rem] z-[1000] flex flex-col gap-2 rounded-2xl px-4 py-3 text-sm shadow-xl ring-1 lg:left-1/2 lg:right-auto lg:w-[32rem] lg:max-w-[calc(100vw-2rem)] lg:-translate-x-1/2 ${
            notice.tone === 'error'
              ? 'bg-red-50 text-red-800 ring-red-200'
              : notice.tone === 'success'
                ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
                : 'bg-white text-slate-800 ring-slate-900/10'
          }`}
        >
          <div className="flex items-start gap-2">
            {notice.tone === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : notice.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : locating ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="flex-1">{notice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className="-mr-1 rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {(notice.offerFallback || notice.offerRetry || (userLocation && notice.tone === 'success')) && (
            <div className="flex flex-wrap gap-2 pl-6">
              {notice.offerFallback && (
                <button
                  type="button"
                  onClick={useCentralAbuja}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  Use Central Abuja Location (Wuse II)
                </button>
              )}
              {notice.offerRetry && (
                <button
                  type="button"
                  onClick={retryWithGps}
                  disabled={locating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry with GPS
                </button>
              )}
              {userLocation && notice.tone === 'success' && (
                <button
                  type="button"
                  onClick={clearLocation}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium underline-offset-2 hover:underline"
                >
                  Clear location
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Drawer                                   */
/* -------------------------------------------------------------------------- */

function DrawerHeading({
  title,
  count,
  subtitle,
  action,
}: {
  title: string;
  count?: number;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-4 pb-1 pt-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {title}
          {typeof count === 'number' && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {count}
            </span>
          )}
        </h2>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function RecentsSection({
  searches,
  facilities,
  onSearch,
  onOpenFacility,
  onClear,
}: {
  searches: string[];
  facilities: RecentFacility[];
  onSearch: (query: string) => void;
  onOpenFacility: (facility: RecentFacility) => void;
  onClear: () => void;
}) {
  const hasRecents = searches.length > 0 || facilities.length > 0;

  return (
    <div className="pb-2">
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          Recent searches &amp; viewed
        </h2>
        {hasRecents && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {hasRecents ? (
        <ul className="px-2">
          {searches.map((query) => (
            <li key={`search:${query}`}>
              <button
                type="button"
                onClick={() => onSearch(query)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{query}</span>
                  <span className="block text-xs text-slate-500">Search again</span>
                </span>
              </button>
            </li>
          ))}
          {facilities.map((facility) => {
            const meta = TYPE_META[facility.type];
            const Icon = meta.icon;
            return (
              <li key={`facility:${facility.id}`}>
                <button
                  type="button"
                  onClick={() => onOpenFacility(facility)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${meta.pill}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{facility.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {meta.label} · {facility.address}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 pb-2 text-xs text-slate-500">
          Facilities you open and searches you run will show up here.
        </p>
      )}
    </div>
  );
}

function FacilityList({
  facilities,
  filters,
  selectedFacilityId,
  onSelect,
  onReset,
}: {
  facilities: FacilityWithHMO[];
  filters: FacilityFilters;
  selectedFacilityId: string | null;
  onSelect: (facility: FacilityWithHMO) => void;
  onReset: () => void;
}) {
  if (facilities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <SearchX className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold text-slate-800">No facilities match</p>
          <p className="mt-1 text-sm text-slate-500">
            Try a different plan, facility type or area, or reset the filters to browse every
            verified facility in Abuja.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset Filters
        </button>
      </div>
    );
  }

  return (
    <ul className="px-2 pb-2">
      {facilities.map((facility) => (
        <li key={facility.id} id={`facility-${facility.id}`}>
          <FacilityRow
            facility={facility}
            activeHmoId={filters.hmoId}
            activePlanTier={filters.planTier}
            selected={facility.id === selectedFacilityId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

function FacilityRow({
  facility,
  activeHmoId,
  activePlanTier,
  selected,
  onSelect,
}: {
  facility: FacilityWithHMO;
  activeHmoId?: string | null;
  activePlanTier?: string | null;
  selected: boolean;
  onSelect: (facility: FacilityWithHMO) => void;
}) {
  const meta = TYPE_META[facility.type];
  const Icon = meta.icon;
  const hasActiveCoverage = Boolean(activeHmoId?.trim() || activePlanTier?.trim());
  const match = hasActiveCoverage ? findHmoMatch(facility, activeHmoId, activePlanTier) : null;
  const listedHmos = facility.facility_hmos.filter((row) => row.hmos).length;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`;

  return (
    <div
      onClick={() => onSelect(facility)}
      className={`group flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 transition-colors ${
        selected ? 'bg-emerald-50' : 'hover:bg-slate-100'
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${meta.pill}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(facility);
          }}
          aria-pressed={selected}
          className="flex max-w-full items-center gap-1.5 rounded-sm text-left text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <span className="truncate">{facility.name}</span>
          {facility.is_verified && (
            <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Verified" />
          )}
        </button>

        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-600">
          <span>{meta.label}</span>
          {facility.review_count > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                {facility.rating.toFixed(1)}
                <span className="text-slate-400">({facility.review_count})</span>
              </span>
            </>
          )}
          {typeof facility.distance_km === 'number' && (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatDistance(facility.distance_km)}</span>
            </>
          )}
        </p>
        <p className="truncate text-xs text-slate-500">{facility.address}</p>

        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {facility.is_open_24_7 && <MiniBadge tone="teal">Open 24/7</MiniBadge>}
          {facility.has_emergency_services && <MiniBadge tone="red">Emergency</MiniBadge>}
          {match ? (
            <MiniBadge tone="emerald">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Accepts {match.hmos?.name ?? 'your plan'}
            </MiniBadge>
          ) : hasActiveCoverage ? (
            <MiniBadge tone="amber">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              Not listed for your plan
            </MiniBadge>
          ) : (
            <span className="text-slate-500">
              {listedHmos > 0 ? `${listedHmos} HMO${listedHmos === 1 ? '' : 's'} accepted` : 'Direct payment only'}
            </span>
          )}
        </p>
      </div>

      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        title="Get directions"
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <Navigation className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Get directions to {facility.name} (opens in a new tab)</span>
      </a>
    </div>
  );
}

function MiniBadge({
  tone,
  children,
}: {
  tone: 'teal' | 'red' | 'emerald' | 'amber';
  children: ReactNode;
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 ring-teal-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Place details                               */
/* -------------------------------------------------------------------------- */

function PlaceDetails({
  facility,
  activeHmoId,
  activePlanTier,
  onBack,
}: {
  facility: FacilityWithHMO;
  activeHmoId?: string | null;
  activePlanTier?: string | null;
  onBack: () => void;
}) {
  const meta = TYPE_META[facility.type];
  const Icon = meta.icon;
  const hasActiveCoverage = Boolean(activeHmoId?.trim() || activePlanTier?.trim());
  const match = hasActiveCoverage ? findHmoMatch(facility, activeHmoId, activePlanTier) : null;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`;
  const phoneHref = facility.phone ? `tel:${facility.phone.replace(/[^\d+]/g, '')}` : null;
  const website = facility.website?.trim() || null;
  const email = facility.email?.trim() || null;

  return (
    <article className="pb-4">
      {/* Sticky header with the back arrow, like a Google Maps place card. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-2 py-2 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Back to list</span>
        </button>
        <span className="text-sm font-medium text-slate-600">Back to list</span>
      </div>

      <div className="space-y-4 px-4 pt-3">
        {/* Title */}
        <header>
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold leading-snug text-slate-900">
            {facility.name}
            {facility.is_verified && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                title="Verified by MedNet"
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Verified
              </span>
            )}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${meta.pill}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {meta.label}
            </span>
            {facility.review_count > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                <span className="font-medium text-slate-800">{facility.rating.toFixed(1)}</span>
                <span className="text-slate-400">({facility.review_count})</span>
              </span>
            )}
            {typeof facility.distance_km === 'number' && (
              <span className="text-slate-500">{formatDistance(facility.distance_km)} away</span>
            )}
          </p>
        </header>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Directions
            <span className="sr-only"> to {facility.name} (opens in a new tab)</span>
          </a>
          {phoneHref && (
            <a
              href={phoneHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Call
              <span className="sr-only"> {facility.name} on {facility.phone}</span>
            </a>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              Website
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>

        {/* Leadway Health plan compatibility */}
        <section aria-label="HMO plan compatibility">
          <HmoCompatibility facility={facility} hasActiveCoverage={hasActiveCoverage} match={match} />
        </section>

        {/* Facts */}
        <dl className="space-y-2.5 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <dt className="sr-only">Address</dt>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dd>
              {facility.address}, {facility.city}, {facility.state}
            </dd>
          </div>
          <div className="flex items-start gap-3">
            <dt className="sr-only">Operating hours</dt>
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dd className="flex flex-wrap items-center gap-2">
              <span>{facility.operating_hours}</span>
              {facility.is_open_24_7 && <MiniBadge tone="teal">Open 24/7</MiniBadge>}
            </dd>
          </div>
          {facility.has_emergency_services && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Emergency services</dt>
              <Ambulance className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              <dd>Emergency services available</dd>
            </div>
          )}
          {facility.phone && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Phone</dt>
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <dd>
                {phoneHref ? (
                  <a href={phoneHref} className="underline-offset-2 hover:underline">
                    {facility.phone}
                  </a>
                ) : (
                  facility.phone
                )}
              </dd>
            </div>
          )}
          {email && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Email</dt>
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <dd className="break-all">
                <a href={`mailto:${email}`} className="underline-offset-2 hover:underline">
                  {email}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {/* Specialties and services */}
        {facility.specialties.length > 0 && (
          <TagList title="Specialties" items={facility.specialties} />
        )}
        {facility.services.length > 0 && <TagList title="Services" items={facility.services} />}

        {facility.description && (
          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">About</h3>
            <p className="text-sm leading-relaxed text-slate-700">{facility.description}</p>
          </section>
        )}
      </div>
    </article>
  );
}

function TagList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Account menu                                */
/* -------------------------------------------------------------------------- */

/**
 * Google Maps-style account control. `pill` shows name and coverage inline
 * (top-right on wider screens); `compact` is an avatar for the search box on
 * phones. Both open the same menu with the onboarding link and sign-out.
 */
function AccountMenu({
  variant,
  profile,
  hmo,
  signingOut,
  onSignOut,
}: {
  variant: 'pill' | 'compact';
  profile: PatientProfile | null;
  hmo: Hmo | null;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!profile) {
    return variant === 'pill' ? (
      <Link
        href="/login"
        className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Sign In / Set HMO
      </Link>
    ) : (
      <Link
        href="/login"
        title="Sign in or set your HMO"
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Sign in or set your HMO</span>
      </Link>
    );
  }

  const coverage =
    profile.has_hmo && hmo
      ? `${hmo.name}${profile.hmo_plan_tier ? ` · ${profile.hmo_plan_tier}` : ''}`
      : null;
  const initials = getInitials(profile.full_name);

  const avatar = (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white"
    >
      {initials}
    </span>
  );

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={profile.full_name}
        className={
          variant === 'pill'
            ? 'flex h-11 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-sm shadow-lg ring-1 ring-slate-900/5 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
            : 'flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
        }
      >
        {avatar}
        {variant === 'pill' && (
          <>
            <span className="max-w-[9rem] truncate font-medium">{profile.full_name}</span>
            {coverage ? (
              <span className="inline-flex max-w-[11rem] items-center gap-1 truncate rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{coverage}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                Out-of-Pocket
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </>
        )}
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl bg-white p-2 text-slate-900 shadow-xl ring-1 ring-slate-900/5"
        >
          <div className="px-2 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{profile.full_name}</p>
            <p className="truncate text-xs text-slate-500">{profile.email}</p>
            <p className="mt-2">
              {coverage ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{coverage}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                  Out-of-Pocket
                </span>
              )}
            </p>
          </div>
          <div className="border-t border-slate-100 pt-1">
            <Link
              role="menuitem"
              href="/onboarding"
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Settings2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Update HMO Plan
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
              ) : (
                <LogOut className="h-4 w-4 text-slate-400" aria-hidden="true" />
              )}
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
