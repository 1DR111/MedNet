'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  ExternalLink,
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
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import BottomNav, { BOTTOM_NAV_HEIGHT, type MobileTab } from '@/components/BottomNav';
import BottomSheet from '@/components/BottomSheet';
import DirectionsPanel from '@/components/DirectionsPanel';
import {
  HmoCompatibility,
  SpecialtyPills,
  TYPE_META,
  VerificationBadge,
  formatDistance,
} from '@/components/FacilityCard';
import type { FocusPadding } from '@/components/FacilityMap';
import FilterBar, { EMPTY_FILTERS } from '@/components/FilterBar';
import MapLegend from '@/components/MapLegend';
import WelcomeSplash from '@/components/WelcomeSplash';
import { clearSavedCoverage, useSavedCoverage, type SavedCoverage } from '@/lib/coverage';
import {
  ABUJA_PRESETS,
  googleMapsDirectionsUrl,
  originCoords,
  originLabel,
  useDirections,
} from '@/lib/directions';
import {
  FACILITY_TYPE_INFO,
  filterFacilities,
  findHmoMatch,
  type FacilityFilters,
  type FacilityWithHMO,
} from '@/lib/facilities';
import { haversineKm, type LatLng } from '@/lib/geolocation';
import { DESKTOP_QUERY, TALL_QUERY, useMediaQuery } from '@/lib/media';
import {
  clearRecents,
  forgetFacility,
  rememberFacility,
  rememberSearch,
  useRecentFacilities,
  useRecentSearches,
  type RecentFacility,
} from '@/lib/recents';
import { dismissSplash, useSplashDismissed } from '@/lib/splash';
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
/** Breathing room (px) between floating UI and a flight target. */
const FOCUS_GUTTER = 16;
/** Height (px) of the zoom button stack, for deciding whether it fits above a sheet. */
const ZOOM_STACK_HEIGHT = 92;
/** Extra top padding (px) on phones so a flown-to pin's head clears the chip strip. */
const MARKER_HEADROOM = 48;

const PROFILE_COLUMNS =
  'id, email, full_name, phone, has_hmo, hmo_id, hmo_plan_tier, hmo_enrollee_id, default_city, onboarding_completed, created_at, updated_at';

/** Desktop sidebar width; on phones the same panels appear in a full-width sheet. */
const BOX_WIDTH = 'w-full md:w-[400px]';

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

type DrawerMode = 'directions' | 'details' | 'idle' | 'results';

/**
 * Which panel the phone bottom sheet shows, if any. `place` follows the
 * selection (directions when active, otherwise the facility's details); the
 * others map to the bottom navigation tabs.
 */
type MobileSheet = 'place' | 'results' | 'recents' | 'account';

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
  if (type !== 'all') parts.push(FACILITY_TYPE_INFO[type].plural);
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
  /** Whether the server saw a signed-in user; signed-in patients never meet the welcome screen. */
  initialSignedIn: boolean;
}

export default function DiscoveryDashboard({
  initialFacilities,
  hmos,
  patientProfile,
  initialSignedIn,
}: DiscoveryDashboardProps) {
  const router = useRouter();

  const [filters, setFilters] = useState<FacilityFilters>(() =>
    filtersFor(resolveCoverage(patientProfile, null)),
  );
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  /** Desktop sidebar visibility. */
  const [drawerOpen, setDrawerOpen] = useState(true);
  /** The map legend, once the patient has toggled it; `null` follows the screen size. */
  const [legendPreference, setLegendPreference] = useState<boolean | null>(null);
  /** Phone bottom sheet; `null` shows the full map. */
  const [sheet, setSheet] = useState<MobileSheet | null>(null);
  /** Open sheet size, so the zoom buttons can sit above it or step aside. */
  const [sheetMetrics, setSheetMetrics] = useState({ height: 0, roomForControls: true });
  // Server rendering assumes a wide screen; phones switch to sheets once hydrated.
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  // A short, wide viewport (landscape phone, small window) has no room for the open legend.
  const tallEnough = useMediaQuery(TALL_QUERY, true);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // The server passes the profile it saw; the client re-checks on mount so a
  // stale or missing cookie read never hides a saved plan.
  const [authState, setAuthState] = useState<AuthState>('unknown');
  const [clientProfile, setClientProfile] = useState<PatientProfile | null>(null);
  const localCoverage = useSavedCoverage();
  const splashDismissed = useSplashDismissed();

  const recentFacilities = useRecentFacilities();
  const recentSearches = useRecentSearches();
  const directions = useDirections();

  const mapRef = useRef<LeafletMap | null>(null);
  /** The top-left stack: search box, chips and drawer. */
  const clusterRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  /* ------------------------------- Derived data ---------------------------- */

  const profile = clientProfile ?? patientProfile;
  const isSignedIn = profile !== null || authState === 'signed-in';
  // First visit as a guest: the welcome screen stands in for the map until an
  // action is chosen (remembered for this tab session) or a session is found.
  const showSplash = !initialSignedIn && !isSignedIn && !splashDismissed;
  const savedCoverage = useMemo(
    () => resolveCoverage(profile, localCoverage),
    [profile, localCoverage],
  );
  const baselineFilters = useMemo(() => filtersFor(savedCoverage), [savedCoverage]);

  // Once the device position is known (from a directions request), annotate
  // with distance and sort nearest-first.
  const userLocation = directions.gps.coords;
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
  const directionsActive = directions.target !== null;
  const drawerMode: DrawerMode = directionsActive
    ? 'directions'
    : selectedFacility
      ? 'details'
      : isIdle
        ? 'idle'
        : 'results';
  const activeTab: MobileTab =
    sheet === null ? 'map' : sheet === 'recents' ? 'recents' : sheet === 'account' ? 'profile' : 'search';
  // The legend starts open where there is room for it (wide and tall screens)
  // and collapsed elsewhere, until the patient toggles it.
  const legendOpen = legendPreference ?? (isDesktop && tallEnough);

  const profileHmo = profile?.hmo_id
    ? (hmos.find((hmo) => hmo.id === profile.hmo_id) ?? null)
    : null;
  const activeHmo = filters.hmoId ? (hmos.find((hmo) => hmo.id === filters.hmoId) ?? null) : null;
  const savedHmoName = savedCoverage
    ? (hmos.find((hmo) => hmo.id === savedCoverage.hmoId)?.name ?? 'your HMO')
    : null;

  // Map overlays for directions: a chosen starting point (other than the
  // device position, which has its own marker) and the route line.
  const originLocation = useMemo(() => {
    const origin = directions.origin;
    if (!origin || origin.kind === 'gps') return null;
    return { position: originCoords(origin), label: originLabel(origin) };
  }, [directions.origin]);
  const activeRouteCoordinates = directions.route.result?.coordinates ?? null;
  // Starting point for the Google Maps hand-off: the chosen origin, else the
  // device position when known.
  const handoffOrigin: LatLng | null = directions.origin
    ? originCoords(directions.origin)
    : userLocation;

  /**
   * Measures the floating UI when the map is about to fly, so the target
   * stays visible beside the drawer (wider screens) or below the search
   * cluster (phones), whatever their current height.
   */
  const getFocusPadding = useCallback((): FocusPadding => {
    // The search box and chips are the cluster's first child; the cluster
    // itself reaches the bottom of the screen on wider screens.
    const bar = clusterRef.current?.firstElementChild?.getBoundingClientRect();
    const drawer = drawerRef.current;
    const drawerRect = drawer && !drawer.hidden ? drawer.getBoundingClientRect() : null;
    const clusterBottom = (bar?.bottom ?? 0) + FOCUS_GUTTER;

    if (window.matchMedia(DESKTOP_QUERY).matches) {
      if (drawerRect) {
        return {
          topLeft: [drawerRect.right + FOCUS_GUTTER, FOCUS_GUTTER],
          bottomRight: [FOCUS_GUTTER, FOCUS_GUTTER],
        };
      }
      return { topLeft: [FOCUS_GUTTER, clusterBottom], bottomRight: [FOCUS_GUTTER, FOCUS_GUTTER] };
    }
    // Phones: the search cluster spans the top; the nav bar and any open
    // sheet cover the bottom.
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 0;
    return {
      topLeft: [0, clusterBottom + MARKER_HEADROOM],
      bottomRight: [0, BOTTOM_NAV_HEIGHT + sheetHeight + FOCUS_GUTTER],
    };
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

  // Fetch the map bundle while the welcome screen is up, so "Browse Map as
  // Guest" reveals the map without a loading pause.
  useEffect(() => {
    if (!showSplash) return;
    void import('@/components/FacilityMap');
  }, [showSplash]);

  // Start each panel view at the top.
  useEffect(() => {
    drawerRef.current?.scrollTo({ top: 0 });
    sheetBodyRef.current?.scrollTo({ top: 0 });
  }, [drawerMode, selectedFacilityId, sheet]);

  // Measure the open sheet so the zoom buttons can ride just above it, or
  // step aside when the sheet reaches up to the search cluster. The layout
  // effect measures before a new sheet's first paint; the observer follows
  // later size changes (expand, collapse, content).
  const measureSheet = useCallback(() => {
    const sheetElement = sheetRef.current;
    if (!sheetElement) return;
    const height = sheetElement.getBoundingClientRect().height;
    const barBottom = clusterRef.current?.firstElementChild?.getBoundingClientRect().bottom ?? 0;
    const sheetTop = window.innerHeight - BOTTOM_NAV_HEIGHT - height;
    const roomForControls = sheetTop - barBottom >= ZOOM_STACK_HEIGHT + 2 * FOCUS_GUTTER;
    setSheetMetrics((current) =>
      current.height === height && current.roomForControls === roomForControls
        ? current
        : { height, roomForControls },
    );
  }, []);

  useLayoutEffect(() => {
    if (isDesktop || !sheet) return;
    measureSheet();
  }, [isDesktop, sheet, measureSheet]);

  useEffect(() => {
    const sheetElement = sheetRef.current;
    if (isDesktop || !sheet || !sheetElement) return;
    const observer = new ResizeObserver(measureSheet);
    observer.observe(sheetElement);
    return () => observer.disconnect();
  }, [isDesktop, sheet, measureSheet]);

  // Plain confirmations fade out; errors and sticky notices stay.
  useEffect(() => {
    if (!notice || notice.tone === 'error' || notice.sticky) return;
    const timer = window.setTimeout(() => setNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /* ------------------------------ Interactions ----------------------------- */

  const { start: startDirectionsTo } = directions;
  const directionsTargetId = directions.target?.id ?? null;

  const selectFacility = useCallback(
    (facility: Facility) => {
      setSelectedFacilityId(facility.id);
      setDrawerOpen(true);
      setSheet('place');
      rememberFacility(toRecent(facility));
      // While directions are open, choosing another facility retargets them.
      if (directionsActive && directionsTargetId !== facility.id) startDirectionsTo(facility);
    },
    [directionsActive, directionsTargetId, startDirectionsTo],
  );

  /** In-app directions: selects the facility and opens the Directions view. */
  const startDirections = useCallback(
    (facility: Facility) => {
      setSelectedFacilityId(facility.id);
      setDrawerOpen(true);
      setSheet('place');
      rememberFacility(toRecent(facility));
      startDirectionsTo(facility);
    },
    [startDirectionsTo],
  );

  const closeSheet = useCallback(() => setSheet(null), []);

  /** After a sheet closes, keyboard focus lands on the active bottom tab. */
  const returnFocusToNav = useCallback(
    () => navRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? null,
    [],
  );

  /** Bottom navigation: Map shows the full map; the other tabs toggle their sheet. */
  function handleTab(tab: MobileTab) {
    if (tab === 'map') {
      setSheet(null);
      return;
    }
    const target: MobileSheet = tab === 'search' ? 'results' : tab === 'recents' ? 'recents' : 'account';
    setSheet((current) => (current === target ? null : target));
  }

  /**
   * Taps on empty map. While the directions panel is in view (always on wider
   * screens, on phones while its sheet is up) they drop a starting pin; with
   * the sheet closed they only bring it back, so the starting point never
   * moves unseen. Otherwise, on phones, they dismiss whatever sheet is up.
   */
  const pinDropActive = directionsActive && (isDesktop || sheet === 'place');
  const handleMapClick = useCallback(
    (coords: LatLng) => {
      if (directionsActive) {
        if (pinDropActive) directions.usePin(coords);
        setSheet('place');
        return;
      }
      setSheet(null);
    },
    [directions, directionsActive, pinDropActive],
  );

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
    if (directionsActive) directions.close();
    // On phones a place sheet has nothing left to show, so the list takes over.
    setSheet((current) => (current === 'place' ? 'results' : current));
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
    setSheet('results');
    if (directionsActive) directions.close();
  }

  function applyRecentSearch(query: string) {
    rememberSearch(query);
    applyFilters({ ...filters, searchQuery: query });
    setSheet('results');
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
    // of the profile and the on-device plan mirror. Signing out lands on the
    // map, not on the first-visit welcome screen.
    clearSavedCoverage();
    dismissSplash();
    setClientProfile(null);
    setAuthState('guest');
    setFilters({ ...EMPTY_FILTERS });
    setSelectedFacilityId(null);
    if (directionsActive) directions.close();
    setSheet(null);
    setSigningOut(false);
    router.refresh();
  }

  /* --------------------------------- Render -------------------------------- */

  if (showSplash) {
    return <WelcomeSplash onBrowseAsGuest={dismissSplash} />;
  }

  const accountMenu = (variant: 'pill' | 'compact') => (
    <AccountMenu
      variant={variant}
      profile={profile}
      hmo={profileHmo}
      signingOut={signingOut}
      onSignOut={signOut}
      onActivate={() => setSheet('account')}
    />
  );

  // The panels are built once and placed in the desktop sidebar or the phone
  // sheet, so both layouts show exactly the same content.
  const facilityList = (
    <FacilityList
      facilities={visibleFacilities}
      filters={filters}
      selectedFacilityId={selectedFacilityId}
      onSelect={selectFacility}
      onStartDirections={startDirections}
      onReset={resetFilters}
    />
  );

  const listPanel = isIdle ? (
    <div>
      <DrawerHeading
        title="Facilities in Abuja"
        count={visibleFacilities.length}
        subtitle={
          activeHmo
            ? `Matching your ${activeHmo.name}${filters.planTier ? ` ${filters.planTier}` : ''} plan`
            : userLocation
              ? 'Sorted by distance from you'
              : 'All listed facilities, A to Z'
        }
      />
      {facilityList}
    </div>
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
      {facilityList}
    </div>
  );

  const recentsPanel = (
    <RecentsSection
      searches={recentSearches}
      facilities={recentFacilities}
      onSearch={applyRecentSearch}
      onOpenFacility={openRecentFacility}
      onClear={clearRecents}
    />
  );

  const directionsPanel =
    directionsActive && directions.target ? (
      <DirectionsPanel
        facility={directions.target}
        origin={directions.origin}
        gps={directions.gps}
        route={directions.route}
        presets={ABUJA_PRESETS}
        onClose={directions.close}
        onUseGps={directions.useGps}
        onRetryGps={directions.retryGps}
        onUsePreset={directions.usePreset}
        onUseAddress={directions.useAddress}
        addressText={directions.addressText}
        onAddressTextChange={directions.setAddressText}
        addressSearch={directions.addressSearch}
        onSearchAddress={directions.searchAddress}
      />
    ) : null;

  const detailsPanel = selectedFacility ? (
    <PlaceDetails
      facility={selectedFacility}
      activeHmoId={filters.hmoId}
      activePlanTier={filters.planTier}
      onBack={() => {
        setSelectedFacilityId(null);
        setSheet('results');
      }}
      onStartDirections={startDirections}
      handoffOrigin={handoffOrigin}
    />
  ) : null;

  /** Directions when active, else the selected facility, else the list. */
  const placePanel = directionsPanel ?? detailsPanel ?? listPanel;

  const sidebarLabel =
    drawerMode === 'directions'
      ? 'Directions'
      : drawerMode === 'details'
        ? 'Facility details'
        : drawerMode === 'results'
          ? 'Search results'
          : 'Recent and nearby facilities';
  const sidebarContent =
    drawerMode === 'idle' ? (
      <>
        {recentsPanel}
        <div className="border-t border-slate-100 dark:border-slate-800">{listPanel}</div>
      </>
    ) : (
      placePanel
    );

  const sheetView =
    sheet === 'recents'
      ? { label: 'Recent searches and viewed facilities', content: recentsPanel }
      : sheet === 'account'
        ? {
            label: 'Account',
            content: (
              <AccountPanel profile={profile} hmo={profileHmo} signingOut={signingOut} onSignOut={signOut} />
            ),
          }
        : sheet === 'place'
          ? {
              label: directionsPanel ? 'Directions' : detailsPanel ? 'Facility details' : 'Facilities',
              content: placePanel,
            }
          : { label: isIdle ? 'All facilities' : 'Search results', content: listPanel };

  const sheetOpen = !isDesktop && sheet !== null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-200 text-slate-900 supports-[height:100dvh]:h-dvh dark:bg-slate-950 dark:text-slate-100">
      {/* Map: fills the viewport; `isolate` keeps Leaflet's z-indexes beneath the floating UI. */}
      <div className="absolute inset-0 z-0 isolate">
        <FacilityMap
          facilities={mapFacilities}
          selectedFacilityId={selectedFacilityId}
          onSelectFacility={selectFacility}
          holdSelectionFlight={directionsActive}
          userLocation={userLocation}
          originLocation={originLocation}
          activeRouteCoordinates={activeRouteCoordinates}
          onMapClick={directionsActive || sheetOpen ? handleMapClick : undefined}
          crosshair={pinDropActive}
          getFocusPadding={getFocusPadding}
          mapRef={mapRef}
          className="h-full w-full"
        />
      </div>

      {/* Top: search box and chips. Phones: the full width. Wider screens: a
          400px column at the top-left with the sidebar beneath it. */}
      <div
        ref={clusterRef}
        className="pointer-events-none absolute left-0 right-0 top-4 z-[1000] flex flex-col gap-2 px-4 md:bottom-4 md:left-4 md:right-auto md:max-w-[calc(100vw-2rem)] md:px-0"
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
            <div className="flex items-center gap-1 md:hidden">
              <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
              {accountMenu('compact')}
            </div>
          }
        />

        {/* Desktop sidebar: hidden below `md` by CSS as well, for the server-rendered
            HTML. `min-h-0` lets it shrink to whatever the chips leave above `bottom-4`. */}
        {isDesktop && (
          <section
            ref={drawerRef}
            id={DRAWER_ID}
            hidden={!drawerOpen}
            aria-label={sidebarLabel}
            className={`pointer-events-auto hidden min-h-0 overflow-y-auto rounded-lg bg-white/95 text-slate-900 shadow-xl ring-1 ring-slate-900/5 backdrop-blur dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10 md:block ${BOX_WIDTH}`}
          >
            {sidebarContent}
          </section>
        )}
      </div>

      {/* Top-right, wider screens only: settings and account. Phones reach both from the Profile tab. */}
      <div className="absolute right-4 top-4 z-[1000] hidden items-center gap-2 md:flex">
        <Link
          href="/settings"
          title="Settings"
          className={`${CONTROL_BUTTON} ${SURFACE} text-slate-700 hover:bg-slate-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300`}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Settings</span>
        </Link>
        {accountMenu('pill')}
      </div>

      {/* Bottom-right: zoom. Phones: above the nav bar, riding up over an open
          sheet while there is room for it under the search cluster. */}
      {(!sheetOpen || sheetMetrics.roomForControls) && (
        <div
          className={`absolute bottom-20 right-4 z-[1000] flex flex-col overflow-hidden rounded-md md:bottom-8 ${SURFACE}`}
          style={sheetOpen ? { bottom: BOTTOM_NAV_HEIGHT + sheetMetrics.height + FOCUS_GUTTER } : undefined}
        >
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
      )}

      {/* Bottom-left: the pin legend, above the OpenStreetMap credit. Wider
          screens: beside the sidebar while it is open. Hidden while a phone
          sheet or a notice is up, since both take that corner. */}
      {!sheetOpen && !notice && (
        <MapLegend
          open={legendOpen}
          followsScreen={legendPreference === null}
          onToggle={() => setLegendPreference(!legendOpen)}
          className={`absolute bottom-24 left-4 z-[1000] md:bottom-8 ${
            isDesktop && drawerOpen ? 'md:left-[calc(400px+2rem)]' : ''
          }`}
        />
      )}

      {/* Toast: above the nav bar on phones, above any sheet by z-order */}
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`absolute bottom-20 left-4 right-[4.5rem] z-[1100] flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-xl ring-1 md:bottom-8 lg:left-1/2 lg:right-auto lg:w-[32rem] lg:max-w-[calc(100vw-2rem)] lg:-translate-x-1/2 ${
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

      {/* Phones: the current panel as a sheet above the nav bar */}
      {sheetOpen && (
        <BottomSheet
          key={sheet}
          ref={sheetRef}
          bodyRef={sheetBodyRef}
          label={sheetView.label}
          onClose={closeSheet}
          returnFocus={returnFocusToNav}
        >
          {sheetView.content}
        </BottomSheet>
      )}

      {/* Phones: bottom navigation */}
      <BottomNav ref={navRef} active={activeTab} onSelect={handleTab} />
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
  onStartDirections,
  onReset,
}: {
  facilities: FacilityWithHMO[];
  filters: FacilityFilters;
  selectedFacilityId: string | null;
  onSelect: (facility: FacilityWithHMO) => void;
  onStartDirections: (facility: FacilityWithHMO) => void;
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
            listed facility in Abuja.
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
            onStartDirections={onStartDirections}
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
  onStartDirections,
}: {
  facility: FacilityWithHMO;
  activeHmoId?: string | null;
  activePlanTier?: string | null;
  selected: boolean;
  onSelect: (facility: FacilityWithHMO) => void;
  onStartDirections: (facility: FacilityWithHMO) => void;
}) {
  const meta = TYPE_META[facility.type];
  const Icon = meta.icon;
  const hasActiveCoverage = Boolean(activeHmoId?.trim() || activePlanTier?.trim());
  const match = hasActiveCoverage ? findHmoMatch(facility, activeHmoId, activePlanTier) : null;
  const listedHmos = facility.facility_hmos.filter((row) => row.hmos).length;

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
          {!facility.is_verified && <VerificationBadge verified={false} size="xs" />}
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

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onStartDirections(facility);
        }}
        title="Get directions"
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-600 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:ring-emerald-800 dark:hover:bg-emerald-600 dark:hover:text-white"
      >
        <Navigation className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Get directions to {facility.name}</span>
      </button>
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
  onStartDirections,
  handoffOrigin,
}: {
  facility: FacilityWithHMO;
  activeHmoId?: string | null;
  activePlanTier?: string | null;
  onBack: () => void;
  onStartDirections: (facility: FacilityWithHMO) => void;
  /** Starting point to pre-fill in the Google Maps hand-off, when known. */
  handoffOrigin: LatLng | null;
}) {
  const meta = TYPE_META[facility.type];
  const googleMapsUrl = googleMapsDirectionsUrl([facility.latitude, facility.longitude], handoffOrigin);
  const Icon = meta.icon;
  const hasActiveCoverage = Boolean(activeHmoId?.trim() || activePlanTier?.trim());
  const match = hasActiveCoverage ? findHmoMatch(facility, activeHmoId, activePlanTier) : null;
  const phoneHref = facility.phone ? `tel:${facility.phone.replace(/[^\d+]/g, '')}` : null;
  const website = facility.website?.trim() || null;
  const email = facility.email?.trim() || null;
  const specialties = (facility.specialties ?? []).map((item) => item.trim()).filter(Boolean);
  const services = (facility.services ?? []).map((item) => item.trim()).filter(Boolean);

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
            <VerificationBadge verified={facility.is_verified} />
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

        {!facility.is_verified && (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            MedNet has not confirmed this listing yet. Call the facility to check hours, services
            and plans before visiting.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onStartDirections(facility)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Get Directions
            <span className="sr-only"> to {facility.name}</span>
          </button>
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

        {/* Hand-off: the facility (and any chosen start) pre-filled in Google Maps */}
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${SECONDARY_ACTION} -mt-2 w-full`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open in Google Maps
          <span className="sr-only"> for {facility.name} (opens in a new tab)</span>
        </a>

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
        {services.length > 0 && <TagList title="Services" items={services} />}

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

/** Rows in the phone account sheet: 44px tall touch targets. */
const SHEET_ITEM =
  'flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100';

const SHEET_PRIMARY =
  'flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900';

const SHEET_SECONDARY =
  'flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-200 dark:focus-visible:ring-offset-slate-900';

const COVERAGE_BADGE =
  'inline-flex max-w-full items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30';

const OUT_OF_POCKET_BADGE =
  'inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';

/** The patient's saved plan, or "Out-of-Pocket" when none is set. */
function CoverageBadge({ profile, hmo }: { profile: PatientProfile; hmo: Hmo | null }) {
  const coverage =
    profile.has_hmo && hmo
      ? `${hmo.name}${profile.hmo_plan_tier ? ` · ${profile.hmo_plan_tier}` : ''}`
      : null;
  return coverage ? (
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
}

/** Initials on the brand colour, sized for a menu button or a sheet header. */
function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-md bg-emerald-600 font-semibold text-white ${
        size === 'lg' ? 'h-11 w-11 text-sm' : 'h-8 w-8 text-xs'
      }`}
    >
      {getInitials(name)}
    </span>
  );
}

/**
 * Google Maps-style account control. `pill` shows name and coverage inline
 * with a dropdown menu (top-right on wider screens). `compact` is an avatar
 * for the search box on phones; it hands off to `onActivate`, which opens
 * the account sheet.
 */
function AccountMenu({
  variant,
  profile,
  hmo,
  signingOut,
  onSignOut,
  onActivate,
}: {
  variant: 'pill' | 'compact';
  profile: PatientProfile | null;
  hmo: Hmo | null;
  signingOut: boolean;
  onSignOut: () => void;
  onActivate?: () => void;
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

  if (variant === 'compact') {
    return profile ? (
      <button
        type="button"
        onClick={onActivate}
        title={profile.full_name}
        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800"
      >
        <Avatar name={profile.full_name} />
        <span className="sr-only">Account</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={onActivate}
        title="Sign in or set your HMO"
        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-emerald-500"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Sign in or set your HMO</span>
      </button>
    );
  }

  if (!profile) {
    return (
      <Link
        href="/login"
        className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Sign In / Set HMO
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={profile.full_name}
        className={`flex h-11 items-center gap-2 rounded-md pl-1.5 pr-3 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800 ${SURFACE}`}
      >
        <Avatar name={profile.full_name} />
        <span className="max-w-[7rem] truncate font-medium lg:max-w-[9rem]">{profile.full_name}</span>
        {/* The badge needs room the 400px search box does not leave at md widths. */}
        <span className="hidden max-w-[11rem] lg:inline">
          <CoverageBadge profile={profile} hmo={hmo} />
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
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
            <p className="mt-2">
              <CoverageBadge profile={profile} hmo={hmo} />
            </p>
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

/**
 * Phone account sheet (the Profile tab): who is signed in and their plan with
 * the account actions, or the ways in for a guest. Everything is full width.
 */
function AccountPanel({
  profile,
  hmo,
  signingOut,
  onSignOut,
}: {
  profile: PatientProfile | null;
  hmo: Hmo | null;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  if (!profile) {
    return (
      <div className="px-4 pb-4 pt-1">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Browsing as a guest</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Set your HMO plan to show only the facilities that accept it. It is kept on this
          device. Sign in to keep it on every device.
        </p>
        <div className="mt-4 grid gap-2">
          <Link href="/login?mode=signin" className={SHEET_PRIMARY}>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign In
          </Link>
          <Link href="/login?mode=signup" className={SHEET_SECONDARY}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Create Account
          </Link>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-2 dark:border-slate-800">
          <Link href="/settings#hmo" className={SHEET_ITEM}>
            <ShieldCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            Set HMO Plan
          </Link>
          <Link href="/settings" className={SHEET_ITEM}>
            <Settings className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-1">
      <div className="flex items-center gap-3">
        <Avatar name={profile.full_name} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{profile.full_name}</p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{profile.email}</p>
        </div>
      </div>
      <p className="mt-3">
        <CoverageBadge profile={profile} hmo={hmo} />
      </p>
      <div className="mt-4 border-t border-slate-100 pt-2 dark:border-slate-800">
        <Link href="/settings" className={SHEET_ITEM}>
          <Settings className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          Settings
        </Link>
        <Link href="/settings#hmo" className={SHEET_ITEM}>
          <ShieldCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          Update HMO Plan
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className={`${SHEET_ITEM} disabled:opacity-60`}
        >
          {signingOut ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" aria-hidden="true" />
          ) : (
            <LogOut className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          )}
          Sign Out
        </button>
      </div>
    </div>
  );
}
