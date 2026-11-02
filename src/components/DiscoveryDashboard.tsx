'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Info,
  Loader2,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  RotateCcw,
  SearchX,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import FacilityCard from '@/components/FacilityCard';
import FilterBar, { EMPTY_FILTERS } from '@/components/FilterBar';
import { filterFacilities, type FacilityFilters, type FacilityWithHMO } from '@/lib/facilities';
import { createClient } from '@/lib/supabase/client';
import type { Hmo, PatientProfile } from '@/types/database';

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
      className="flex h-full w-full animate-pulse flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-100 text-sm text-slate-500"
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

const DESKTOP_QUERY = '(min-width: 1024px)';

type Notice = { tone: 'info' | 'success' | 'error'; message: string } | null;

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function initialFiltersFor(profile: PatientProfile | null): FacilityFilters {
  if (profile?.has_hmo && profile.hmo_id) {
    return { ...EMPTY_FILTERS, hmoId: profile.hmo_id, planTier: profile.hmo_plan_tier ?? null };
  }
  return { ...EMPTY_FILTERS };
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
      return 'Location access was denied. Allow location in your browser settings to see distances, or keep browsing Abuja facilities.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location could not be determined right now. Please try again.';
    case error.TIMEOUT:
      return 'Finding your location took too long. Please try again.';
    default:
      return 'Something went wrong while finding your location.';
  }
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

  const [filters, setFilters] = useState<FacilityFilters>(() => initialFiltersFor(patientProfile));
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const mapSectionRef = useRef<HTMLDivElement>(null);

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

  const activeHmo = filters.hmoId ? (hmos.find((hmo) => hmo.id === filters.hmoId) ?? null) : null;
  const profileHmo = patientProfile?.hmo_id
    ? (hmos.find((hmo) => hmo.id === patientProfile.hmo_id) ?? null)
    : null;

  /* ------------------------------ Interactions ----------------------------- */

  function selectFromList(facility: FacilityWithHMO) {
    setSelectedFacilityId(facility.id);
    // On small screens the map sits below the list; bring it into view.
    if (typeof window !== 'undefined' && !window.matchMedia(DESKTOP_QUERY).matches) {
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function selectFromMap(facility: { id: string }) {
    setSelectedFacilityId(facility.id);
    document
      .getElementById(`facility-${facility.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function locateMe() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setNotice({ tone: 'error', message: 'Your browser does not support location services.' });
      return;
    }

    setLocating(true);
    setNotice({ tone: 'info', message: 'Finding your location…' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
        setLocating(false);

        if (!isInsideAbuja(coords)) {
          setUserLocation(null);
          setNotice({
            tone: 'info',
            message:
              'You appear to be outside Abuja. MedNet currently lists Abuja facilities only, so the map stays centred on the city.',
          });
          return;
        }

        setUserLocation(coords);
        setSelectedFacilityId(null);
        setNotice({
          tone: 'success',
          message: 'Location found. Facilities are now sorted by distance from you.',
        });
      },
      (error) => {
        setLocating(false);
        setNotice({ tone: 'error', message: geolocationErrorMessage(error) });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
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

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          {/* Brand */}
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
              <HeartPulse className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold leading-tight tracking-tight">MedNet</span>
              <span className="block truncate text-xs text-slate-500">
                Verified Healthcare Discovery — Abuja
              </span>
            </span>
          </Link>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Locate Me */}
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              aria-pressed={userLocation !== null}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
                userLocation
                  ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800'
              }`}
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
              )}
              {locating ? 'Locating…' : userLocation ? 'Located' : 'Locate Me'}
            </button>

            {/* Patient status */}
            {patientProfile ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="max-w-[10rem] truncate font-medium" title={patientProfile.full_name}>
                    {patientProfile.full_name}
                  </span>
                </span>

                {patientProfile.has_hmo && profileHmo ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {profileHmo.name}
                    {patientProfile.hmo_plan_tier ? ` · ${patientProfile.hmo_plan_tier}` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                    Out-of-Pocket
                  </span>
                )}

                <Link
                  href="/onboarding"
                  className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
                >
                  Update HMO Plan
                </Link>

                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60"
                >
                  {signingOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign In / Set HMO
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-4 sm:px-6">
        {/* Status notice */}
        {notice && (
          <div
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
              notice.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : notice.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-sky-200 bg-sky-50 text-sky-800'
            }`}
          >
            {notice.tone === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : notice.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="flex-1">{notice.message}</span>
            {userLocation && (
              <button
                type="button"
                onClick={clearLocation}
                className="text-xs font-medium underline-offset-2 hover:underline"
              >
                Clear location
              </button>
            )}
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className="rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          hmos={hmos}
          patientProfile={patientProfile}
          resultCount={visibleFacilities.length}
        />

        {/* Split layout */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {/* Results */}
          <section aria-label="Facility results" className="min-w-0">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">
                {visibleFacilities.length === initialFacilities.length
                  ? `${initialFacilities.length} ${initialFacilities.length === 1 ? 'facility' : 'facilities'} in Abuja`
                  : `${visibleFacilities.length} of ${initialFacilities.length} facilities`}
              </h2>
              <p className="text-xs text-slate-500">
                {activeHmo
                  ? `Accepting ${activeHmo.name}${filters.planTier ? ` ${filters.planTier}` : ''}`
                  : userLocation
                    ? 'Sorted by distance from you'
                    : 'Sorted by name'}
              </p>
            </div>

            {visibleFacilities.length > 0 ? (
              <ul className="space-y-3 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
                {visibleFacilities.map((facility) => (
                  <li key={facility.id} id={`facility-${facility.id}`} className="scroll-mt-24">
                    <FacilityCard
                      facility={facility}
                      activeHmoId={filters.hmoId}
                      activePlanTier={filters.planTier}
                      isSelected={facility.id === selectedFacilityId}
                      onSelect={selectFromList}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <SearchX className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">No facilities match these filters</p>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">
                    Try a different plan, facility type or area, or reset the filters to browse
                    every verified facility in Abuja.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset Filters
                </button>
              </div>
            )}
          </section>

          {/* Map */}
          <div ref={mapSectionRef} className="scroll-mt-20 lg:sticky lg:top-20">
            <div className="isolate h-[440px] w-full overflow-hidden rounded-xl lg:h-[calc(100vh-220px)]">
              <FacilityMap
                facilities={visibleFacilities}
                selectedFacilityId={selectedFacilityId}
                onSelectFacility={selectFromMap}
                userLocation={userLocation}
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
