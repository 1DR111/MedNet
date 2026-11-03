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
  Info,
  Loader2,
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
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  HmoCompatibility,
  SpecialtyPills,
  TYPE_META,
  formatDistance,
} from '@/components/FacilityCard';
import type { FocusPadding } from '@/components/FacilityMap';
import FilterBar, { EMPTY_FILTERS } from '@/components/FilterBar';
import { clearSavedCoverage, useSavedCoverage, type SavedCoverage } from '@/lib/coverage';
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
      className="flex h-full w-full animate-pulse flex-col items-center justify-center gap-3 bg-slate-200 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400"
    >
      <MapPin className="h-8 w-8 text-slate-400 dark:text-slate-600" aria-hidden="true" />
      Loading map…
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

const DRAWER_ID = 'discovery-drawer';
/** Tailwind `sm`: from here the drawer sits beside the map instead of over its top. */
const DESKTOP_QUERY = '(min-width: 640px)';
/** Breathing room (px) between floating UI and a flight target. */
const FOCUS_GUTTER = 16;
/** Height (px) of the bottom band on phones: zoom controls and toasts. */
const MOBILE_BOTTOM_UI = 140;

const PROFILE_COLUMNS =
  'id, email, full_name, phone, has_hmo, hmo_id, hmo_plan_tier, hmo_enrollee_id, default_city, onboarding_completed, created_at, updated_at';

const BOX_WIDTH = 'w-[360px] max-w-[calc(100vw-2rem)] sm:w-[400px]';

/** Floating white panel (search box, drawer, menus, controls). */
const SURFACE =
  'bg-white text-slate-900 shadow-lg ring-1 ring-slate-900/5 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10';

/** 44px square icon button on a floating surface. */
const CONTROL_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';

type Notice = {
  tone: 'info' | 'success' | 'error';
  message: string;
  /** Never auto-dismiss. */
  sticky?: boolean;
} | null;

type DrawerMode = 'details' | 'idle' | 'results';

/** What the client knows about the session, checked on mount. */
type AuthState = 'unknown' | 'guest' | 'signed-in';

/** The plan the "My HMO Plan" chip toggles. */
type Coverage = { hmoId: string; planTier: string | null };

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/**
 * The coverage to filter by. A profile (server or client) is authoritative for
 * a signed-in patient; the on-device mirror covers guests and the moment
 * before the profile row is known.
 */
function resolveCoverage(
  profile: PatientProfile | null,
  local: SavedCoverage | null,
): Coverage | null {
  if (profile) {
    return profile.has_hmo && profile.hmo_id
      ? { hmoId: profile.hmo_id, planTier: profile.hmo_plan_tier ?? null }
      : null;
  }
  if (local?.has_hmo && local.hmo_id) {
    return { hmoId: local.hmo_id, planTier: local.hmo_plan_tier };
  }
  return null;
}

function filtersFor(coverage: Coverage | null): FacilityFilters {
  return coverage
    ? { ...EMPTY_FILTERS, hmoId: coverage.hmoId, planTier: coverage.planTier }
    : { ...EMPTY_FILTERS };
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

  const [filters, setFilters] = useState<FacilityFilters>(() =>
    filtersFor(resolveCoverage(patientProfile, null)),
  );
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // The server passes the profile it saw; the client re-checks on mount so a
  // stale or missing cookie read never hides a saved plan.
  const [authState, setAuthState] = useState<AuthState>('unknown');
  const [clientProfile, setClientProfile] = useState<PatientProfile | null>(null);
  const localCoverage = useSavedCoverage();

  const recentFacilities = useRecentFacilities();
  const recentSearches = useRecentSearches();

  const mapRef = useRef<LeafletMap | null>(null);
  /** The top-left stack: search box, chips and drawer. */
  const clusterRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  /* ------------------------------- Derived data ---------------------------- */

  const profile = clientProfile ?? patientProfile;
  const isSignedIn = profile !== null || authState === 'signed-in';
  const savedCoverage = useMemo(
    () => resolveCoverage(profile, localCoverage),
    [profile, localCoverage],
  );
  const baselineFilters = useMemo(() => filtersFor(savedCoverage), [savedCoverage]);

  const facilities = initialFacilities;
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

  const profileHmo = profile?.hmo_id
    ? (hmos.find((hmo) => hmo.id === profile.hmo_id) ?? null)
    : null;
  const activeHmo = filters.hmoId ? (hmos.find((hmo) => hmo.id === filters.hmoId) ?? null) : null;
  const savedHmoName = savedCoverage
    ? (hmos.find((hmo) => hmo.id === savedCoverage.hmoId)?.name ?? 'your HMO')
    : null;

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

  // Verify the session and load the freshest profile row on the client.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function verify() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setAuthState('guest');
        return;
      }
      setAuthState('signed-in');

      const { data, error } = await supabase
        .from('patient_profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', user.id)
        .maybeSingle()
        .overrideTypes<PatientProfile, { merge: false }>();
      if (cancelled || error || !data) return;

      setClientProfile(data);

      // If the server did not know the patient, apply their plan now, unless
      // they have already started filtering.
      if (!patientProfile && data.has_hmo && data.hmo_id) {
        const seeded: FacilityFilters = {
          ...EMPTY_FILTERS,
          hmoId: data.hmo_id,
          planTier: data.hmo_plan_tier ?? null,
        };
        setFilters((current) => (filtersEqual(current, EMPTY_FILTERS) ? seeded : current));
      }
    }

    verify().catch(() => {
      if (!cancelled) setAuthState('guest');
    });

    return () => {
      cancelled = true;
    };
  }, [patientProfile]);

  // Start each drawer view at the top.
  useEffect(() => {
    drawerRef.current?.scrollTo({ top: 0 });
  }, [drawerMode, selectedFacilityId]);

  // Plain confirmations fade out; errors and sticky notices stay.
  useEffect(() => {
    if (!notice || notice.tone === 'error' || notice.sticky) return;
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

  /**
   * "My HMO Plan" chip:
   * - saved plan known (account or this device): toggle it on the map;
   * - signed in but no plan yet: go and set one in Settings;
   * - confirmed guest with nothing saved: sign in first.
   */
  function handleMyPlanClick() {
    if (savedCoverage) {
      const active =
        (filters.hmoId ?? null) === savedCoverage.hmoId &&
        (filters.planTier ?? null) === savedCoverage.planTier;
      applyFilters(
        active
          ? { ...filters, hmoId: null, planTier: null }
          : { ...filters, hmoId: savedCoverage.hmoId, planTier: savedCoverage.planTier },
      );
      return;
    }
    router.push(!isSignedIn && authState === 'guest' ? '/login' : '/settings#hmo');
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

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      setNotice({ tone: 'error', message: `Could not sign out: ${error.message}` });
      return;
    }
    // Drop everything that belonged to the account: filters, the client copy
    // of the profile and the on-device plan mirror.
    clearSavedCoverage();
    setClientProfile(null);
    setAuthState('guest');
    setFilters({ ...EMPTY_FILTERS });
    setSelectedFacilityId(null);
    setSigningOut(false);
    router.refresh();
  }

  /* --------------------------------- Render -------------------------------- */

  const accountMenu = (variant: 'pill' | 'compact') => (
    <AccountMenu
      variant={variant}
      profile={profile}
      hmo={profileHmo}
      signingOut={signingOut}
      onSignOut={signOut}
    />
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-200 text-slate-900 supports-[height:100dvh]:h-dvh dark:bg-slate-950 dark:text-slate-100">
      {/* Map: fills the viewport; `isolate` keeps Leaflet's z-indexes beneath the floating UI. */}
      <div className="absolute inset-0 z-0 isolate">
        <FacilityMap
          facilities={mapFacilities}
          selectedFacilityId={selectedFacilityId}
          onSelectFacility={selectFacility}
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
          myPlan={
            savedCoverage
              ? {
                  hmoId: savedCoverage.hmoId,
                  planTier: savedCoverage.planTier,
                  label: `${savedHmoName}${savedCoverage.planTier ? ` ${savedCoverage.planTier}` : ''}`,
                }
              : null
          }
          onMyPlanClick={handleMyPlanClick}
          onSearchSubmit={submitSearch}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((open) => !open)}
          drawerId={DRAWER_ID}
          trailing={
            <div className="flex items-center gap-1 sm:hidden">
              <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
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
          className={`pointer-events-auto max-h-[min(40vh,20rem)] overflow-y-auto rounded-lg bg-white/95 text-slate-900 shadow-xl ring-1 ring-slate-900/5 backdrop-blur dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10 sm:max-h-[calc(100vh-140px)] ${BOX_WIDTH}`}
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
              <div className="border-t border-slate-100 dark:border-slate-800">
                <DrawerHeading
                  title="Verified in Abuja"
                  count={visibleFacilities.length}
                  subtitle={
                    activeHmo
                      ? `Matching your ${activeHmo.name}${filters.planTier ? ` ${filters.planTier}` : ''} plan`
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
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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

      {/* Top-right: settings (every screen size) and account (wider screens) */}
      <div className="absolute right-4 top-4 z-[1000] flex items-center gap-2">
        <Link
          href="/settings"
          title="Settings"
          className={`${CONTROL_BUTTON} ${SURFACE} text-slate-700 hover:bg-slate-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300`}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Settings</span>
        </Link>
        <div className="hidden sm:block">{accountMenu('pill')}</div>
      </div>

      {/* Bottom-right: zoom */}
      <div className={`absolute bottom-6 right-4 z-[1000] flex flex-col overflow-hidden rounded-md ${SURFACE}`}>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          title="Zoom in"
          className="flex h-11 w-11 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-emerald-50 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Zoom in</span>
        </button>
        <span className="mx-2 h-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          title="Zoom out"
          className="flex h-11 w-11 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-emerald-50 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Zoom out</span>
        </button>
      </div>

      {/* Toast */}
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`absolute bottom-6 left-4 right-[4.5rem] z-[1000] flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-xl ring-1 lg:left-1/2 lg:right-auto lg:w-[32rem] lg:max-w-[calc(100vw-2rem)] lg:-translate-x-1/2 ${
            notice.tone === 'error'
              ? 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900'
              : notice.tone === 'success'
                ? 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-900'
                : 'bg-white text-slate-800 ring-slate-900/10 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10'
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
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
            className="-mr-1 rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
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
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
          {typeof count === 'number' && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {count}
            </span>
          )}
        </h2>
        {subtitle && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const DRAWER_ROW =
  'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800';

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
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          Recent searches &amp; viewed
        </h2>
        {hasRecents && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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
              <button type="button" onClick={() => onSearch(query)} className={DRAWER_ROW}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{query}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Search again</span>
                </span>
              </button>
            </li>
          ))}
          {facilities.map((facility) => {
            const meta = TYPE_META[facility.type];
            const Icon = meta.icon;
            return (
              <li key={`facility:${facility.id}`}>
                <button type="button" onClick={() => onOpenFacility(facility)} className={DRAWER_ROW}>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${meta.pill}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                      {facility.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {meta.label} · {facility.address}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 pb-2 text-xs text-slate-500 dark:text-slate-400">
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
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <SearchX className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">No facilities match</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Try a different plan, facility type or area, or reset the filters to browse every
            verified facility in Abuja.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900"
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
      className={`group flex cursor-pointer items-start gap-3 rounded-md px-2 py-2.5 transition-colors ${
        selected
          ? 'bg-emerald-50 dark:bg-emerald-500/10'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${meta.pill}`}
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
          className="flex max-w-full items-center gap-1.5 rounded-sm text-left text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
        >
          <span className="truncate">{facility.name}</span>
          {facility.is_verified && (
            <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Verified" />
          )}
        </button>

        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span>{meta.label}</span>
          {typeof facility.distance_km === 'number' && (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatDistance(facility.distance_km)}</span>
            </>
          )}
        </p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{facility.address}</p>

        <SpecialtyPills specialties={facility.specialties} className="mt-1" />

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
            <span className="text-slate-500 dark:text-slate-400">
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
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:ring-emerald-800 dark:hover:bg-emerald-600 dark:hover:text-white"
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
    teal: 'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/30',
    red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30',
    emerald:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
    amber:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Place details                               */
/* -------------------------------------------------------------------------- */

const SECONDARY_ACTION =
  'inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-200 dark:focus-visible:ring-offset-slate-900';

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
  const specialties = (facility.specialties ?? []).map((item) => item.trim()).filter(Boolean);

  return (
    <article className="pb-4">
      {/* Sticky header with the back arrow, like a Google Maps place card. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Back to list</span>
        </button>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Back to list</span>
      </div>

      <div className="space-y-4 px-4 pt-3">
        {/* Title */}
        <header>
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
            {facility.name}
            {facility.is_verified && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30"
                title="Verified by MedNet"
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Verified
              </span>
            )}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${meta.pill}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {meta.label}
            </span>
            {typeof facility.distance_km === 'number' && (
              <span className="text-slate-500 dark:text-slate-400">
                {formatDistance(facility.distance_km)} away
              </span>
            )}
          </p>
        </header>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Directions
            <span className="sr-only"> to {facility.name} (opens in a new tab)</span>
          </a>
          {phoneHref && (
            <a href={phoneHref} className={SECONDARY_ACTION}>
              <Phone className="h-4 w-4" aria-hidden="true" />
              Call
              <span className="sr-only"> {facility.name} on {facility.phone}</span>
            </a>
          )}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className={SECONDARY_ACTION}>
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
        <dl className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
          <div className="flex items-start gap-3">
            <dt className="sr-only">Address</dt>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <dd>
              {facility.address}, {facility.city}, {facility.state}
            </dd>
          </div>
          <div className="flex items-start gap-3">
            <dt className="sr-only">Operating hours</dt>
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <dd className="flex flex-wrap items-center gap-2">
              <span>{facility.operating_hours}</span>
              {facility.is_open_24_7 && <MiniBadge tone="teal">Open 24/7</MiniBadge>}
            </dd>
          </div>
          {facility.has_emergency_services && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Emergency services</dt>
              <Ambulance className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" aria-hidden="true" />
              <dd>Emergency services available</dd>
            </div>
          )}
          {facility.phone && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Phone</dt>
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
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
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <dd className="break-all">
                <a href={`mailto:${email}`} className="underline-offset-2 hover:underline">
                  {email}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {/* Specialties (all of them) and services */}
        {specialties.length > 0 && <TagList title="Specialties" items={specialties} />}
        {facility.services.length > 0 && <TagList title="Services" items={facility.services} />}

        {facility.description && (
          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              About
            </h3>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {facility.description}
            </p>
          </section>
        )}
      </div>
    </article>
  );
}

function TagList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
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

const MENU_ITEM =
  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100';

const COVERAGE_BADGE =
  'inline-flex max-w-full items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30';

const OUT_OF_POCKET_BADGE =
  'inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';

/**
 * Google Maps-style account control. `pill` shows name and coverage inline
 * (top-right on wider screens); `compact` is an avatar for the search box on
 * phones. Both open the same menu with settings, the HMO link and sign-out.
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
        className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Sign In / Set HMO
      </Link>
    ) : (
      <Link
        href="/login"
        title="Sign in or set your HMO"
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-emerald-500"
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-xs font-semibold text-white"
    >
      {initials}
    </span>
  );

  const coverageBadge = coverage ? (
    <span className={COVERAGE_BADGE}>
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{coverage}</span>
    </span>
  ) : (
    <span className={OUT_OF_POCKET_BADGE}>
      <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
      Out-of-Pocket
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
            ? `flex h-11 items-center gap-2 rounded-md pl-1.5 pr-3 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800 ${SURFACE}`
            : 'flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800'
        }
      >
        {avatar}
        {variant === 'pill' && (
          <>
            <span className="max-w-[9rem] truncate font-medium">{profile.full_name}</span>
            <span className="max-w-[11rem]">{coverageBadge}</span>
            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </>
        )}
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg bg-white p-2 text-slate-900 shadow-xl ring-1 ring-slate-900/5 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10"
        >
          <div className="px-2 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{profile.full_name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{profile.email}</p>
            <p className="mt-2">{coverageBadge}</p>
          </div>
          <div className="border-t border-slate-100 pt-1 dark:border-slate-800">
            <Link role="menuitem" href="/settings" className={MENU_ITEM}>
              <Settings className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              Settings
            </Link>
            <Link role="menuitem" href="/settings#hmo" className={MENU_ITEM}>
              <ShieldCheck className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              Update HMO Plan
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              disabled={signingOut}
              className={`${MENU_ITEM} disabled:opacity-60`}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" aria-hidden="true" />
              ) : (
                <LogOut className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              )}
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
