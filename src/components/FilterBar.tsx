'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import Link from 'next/link';
import {
  Ambulance,
  Building2,
  Check,
  ChevronDown,
  Clock,
  FlaskConical,
  Menu,
  PanelLeftClose,
  Pill as PillIcon,
  Search,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import type { FacilityFilters } from '@/lib/facilities';
import { PLAN_TIER_GROUPS } from '@/lib/plans';
import type { FacilityType, Hmo, PatientProfile } from '@/types/database';

/**
 * Google Maps-style search box with a strip of filter chips underneath.
 *
 * Positioned by its parent (it is meant to float over the map). The parent
 * usually wraps it in a `pointer-events-none` container so the map stays
 * interactive between the pieces; every interactive piece here re-enables
 * pointer events on itself.
 */
export interface FilterBarProps {
  filters: FacilityFilters;
  onFilterChange: (filters: FacilityFilters) => void;
  /** HMOs available in the HMO selector. */
  hmos: Hmo[];
  /** Signed-in patient, used for the one-click "My HMO Plan" chip. */
  patientProfile?: PatientProfile | null;
  /** Called with the trimmed query when the search form is submitted. */
  onSearchSubmit?: (query: string) => void;
  /** Whether the drawer below the bar is expanded. */
  drawerOpen?: boolean;
  /** Toggles the drawer below the bar. */
  onToggleDrawer?: () => void;
  /** `id` of the drawer element, for `aria-controls`. */
  drawerId?: string;
  /** Rendered at the trailing end of the search box (e.g. an account button). */
  trailing?: ReactNode;
  className?: string;
}

type TypeOption = { value: FacilityType; label: string; icon: typeof Building2 };

const TYPE_OPTIONS: readonly TypeOption[] = [
  { value: 'hospital', label: 'Hospitals', icon: Building2 },
  { value: 'clinic', label: 'Clinics', icon: Stethoscope },
  { value: 'pharmacy', label: 'Pharmacies', icon: PillIcon },
  { value: 'laboratory', label: 'Labs', icon: FlaskConical },
];

/** Filters with every dimension switched off; used by "Clear all". */
export const EMPTY_FILTERS: FacilityFilters = {
  searchQuery: '',
  facilityType: 'all',
  hmoId: null,
  planTier: null,
  only24Hours: false,
  onlyEmergency: false,
};

/** Width shared by the search box and the drawer below it. */
const BOX_WIDTH = 'w-[360px] max-w-[calc(100vw-2rem)] sm:w-[400px]';

const PLAN_MENU_WIDTH = 300;
/** Minimum gap (px) between the HMO & Plan panel and the viewport edge. */
const VIEWPORT_GUTTER = 16;

type Anchor = { left: number; top: number };

/**
 * Where to place the HMO & Plan panel: directly under its chip, measured from
 * the chip's on-screen rectangle (so it follows the strip's scroll position and
 * any wrapping) and pulled left when it would overflow the viewport.
 */
function anchorBelow(chip: HTMLElement, wrapper: HTMLElement): Anchor {
  const chipRect = chip.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const width = Math.min(PLAN_MENU_WIDTH, window.innerWidth - 2 * VIEWPORT_GUTTER);
  const maxLeft = window.innerWidth - VIEWPORT_GUTTER - width - wrapperRect.left;
  return {
    left: Math.max(0, Math.min(chipRect.left - wrapperRect.left, maxLeft)),
    top: chipRect.bottom - wrapperRect.top + 4,
  };
}

export default function FilterBar({
  filters,
  onFilterChange,
  hmos,
  patientProfile = null,
  onSearchSubmit,
  drawerOpen = true,
  onToggleDrawer,
  drawerId,
  trailing,
  className = '',
}: FilterBarProps) {
  // The HMO & Plan panel is open while it has an anchor position.
  const [planMenu, setPlanMenu] = useState<Anchor | null>(null);
  const planMenuOpen = planMenu !== null;
  const planMenuRef = useRef<HTMLDivElement>(null);
  const planChipRef = useRef<HTMLButtonElement>(null);
  const stripWrapperRef = useRef<HTMLDivElement>(null);
  const planMenuId = useId();

  // On phones the chip strip scrolls sideways; track whether it is scrolled
  // to either end so the edges can fade only where more chips are hidden.
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripEdges, setStripEdges] = useState({ atStart: true, atEnd: true });

  function update(patch: Partial<FacilityFilters>) {
    onFilterChange({ ...filters, ...patch });
  }

  const searchQuery = filters.searchQuery ?? '';
  const facilityType = filters.facilityType ?? 'all';
  const hmoId = filters.hmoId ?? '';
  const planTier = filters.planTier ?? '';
  const only24Hours = filters.only24Hours === true;
  const onlyEmergency = filters.onlyEmergency === true;

  // "My HMO Plan" quick toggle, only for patients who saved coverage.
  const savedHmoId = patientProfile?.has_hmo ? (patientProfile.hmo_id ?? null) : null;
  const savedTier = patientProfile?.has_hmo ? (patientProfile.hmo_plan_tier ?? null) : null;
  const canUseMyPlan = savedHmoId !== null;
  const savedHmoName = savedHmoId
    ? (hmos.find((hmo) => hmo.id === savedHmoId)?.name ?? 'My HMO')
    : null;
  const myPlanActive =
    canUseMyPlan && (filters.hmoId ?? null) === savedHmoId && (filters.planTier ?? null) === savedTier;

  function toggleMyPlan() {
    if (!canUseMyPlan) return;
    if (myPlanActive) {
      update({ hmoId: null, planTier: null });
    } else {
      update({ hmoId: savedHmoId, planTier: savedTier });
    }
  }

  const selectedHmoName = hmoId ? (hmos.find((hmo) => hmo.id === hmoId)?.name ?? 'HMO') : null;
  const planChipActive = hmoId !== '' || planTier !== '';
  const planChipLabel = planChipActive
    ? [selectedHmoName ?? 'Any HMO', planTier || 'All plans'].join(' · ')
    : 'HMO & Plan';

  function togglePlanMenu() {
    const chip = planChipRef.current;
    const wrapper = stripWrapperRef.current;
    setPlanMenu(planMenu || !chip || !wrapper ? null : anchorBelow(chip, wrapper));
  }

  // While the HMO & Plan panel is open: close it on outside click or Escape
  // (clicks on its own chip are left to the chip's toggle), and keep it under
  // the chip when the strip scrolls, the window resizes or the chip relabels.
  useEffect(() => {
    if (!planMenuOpen) return;
    const chip = planChipRef.current;
    const wrapper = stripWrapperRef.current;
    const strip = stripRef.current;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (chip?.contains(target)) return;
      if (!planMenuRef.current?.contains(target)) setPlanMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlanMenu(null);
    };
    const reposition = () => {
      if (chip && wrapper) setPlanMenu(anchorBelow(chip, wrapper));
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposition);
    strip?.addEventListener('scroll', reposition, { passive: true });
    const resizeObserver = new ResizeObserver(reposition);
    if (chip) resizeObserver.observe(chip);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', reposition);
      strip?.removeEventListener('scroll', reposition);
      resizeObserver.disconnect();
    };
  }, [planMenuOpen]);

  // Measure the strip's scroll position on scroll, resize and content changes
  // (a chip appearing or relabelling changes the scrollable width).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const update = () => {
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      const atStart = strip.scrollLeft <= 1;
      const atEnd = strip.scrollLeft >= maxScroll - 1;
      setStripEdges((previous) =>
        previous.atStart === atStart && previous.atEnd === atEnd ? previous : { atStart, atEnd },
      );
    };

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(strip);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(strip, { childList: true, subtree: true, characterData: true });
    strip.addEventListener('scroll', update, { passive: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      strip.removeEventListener('scroll', update);
    };
  }, []);

  const stripMask =
    stripEdges.atStart && stripEdges.atEnd
      ? ''
      : stripEdges.atStart
        ? '[mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)]'
        : stripEdges.atEnd
          ? '[mask-image:linear-gradient(to_right,transparent,#000_3rem)]'
          : '[mask-image:linear-gradient(to_right,transparent,#000_3rem,#000_calc(100%-3rem),transparent)]';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit?.(searchQuery.trim());
    // Dismiss the on-screen keyboard on phones.
    event.currentTarget.querySelector('input')?.blur();
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Search box */}
      <form
        role="search"
        onSubmit={handleSubmit}
        className={`pointer-events-auto flex h-12 items-center gap-1 rounded-2xl bg-white px-1.5 text-slate-900 shadow-lg ring-1 ring-slate-900/5 ${BOX_WIDTH}`}
      >
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          title={drawerOpen ? 'Hide panel' : 'Show panel'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {drawerOpen ? (
            <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="sr-only">{drawerOpen ? 'Hide panel' : 'Show panel'}</span>
        </button>

        <label htmlFor="facility-search" className="sr-only">
          Search facilities
        </label>
        <input
          id="facility-search"
          type="search"
          value={searchQuery}
          onChange={(event) => update({ searchQuery: event.target.value })}
          placeholder="Search hospitals, clinics, pharmacies…"
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />

        {searchQuery ? (
          <button
            type="button"
            onClick={() => update({ searchQuery: '' })}
            title="Clear search"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Clear search</span>
          </button>
        ) : (
          <button
            type="submit"
            title="Search"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Search</span>
          </button>
        )}

        {trailing}
      </form>

      {/* Filter chips. Phones: one scrollable row with faded edges. Wider
          screens: wraps, so no chip is ever clipped; only the chips themselves
          take pointer events there, leaving the map clickable around them. */}
      <div ref={stripWrapperRef} className="relative">
        <div
          ref={stripRef}
          role="group"
          aria-label="Quick filters"
          className={`pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] gap-2 overflow-x-auto py-1.5 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:pointer-events-none sm:w-auto sm:flex-wrap sm:overflow-visible sm:pr-0 sm:[mask-image:none] ${stripMask}`}
        >
          {TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = facilityType === option.value;
            return (
              <Chip
                key={option.value}
                active={active}
                onClick={() => update({ facilityType: active ? 'all' : option.value })}
                icon={<Icon className="h-4 w-4" aria-hidden="true" />}
              >
                {option.label}
              </Chip>
            );
          })}

          {canUseMyPlan ? (
            <Chip
              active={myPlanActive}
              onClick={toggleMyPlan}
              icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              title={
                myPlanActive
                  ? 'Stop filtering by your saved HMO plan'
                  : `Only show facilities that accept ${savedHmoName}${savedTier ? ` ${savedTier}` : ''}`
              }
            >
              My HMO Plan
            </Chip>
          ) : (
            <Link
              href={patientProfile ? '/onboarding' : '/login'}
              title={
                patientProfile
                  ? 'Save your HMO plan to filter by it'
                  : 'Sign in and save your HMO plan to filter by it'
              }
              className={`${CHIP_BASE} bg-white text-slate-700 hover:bg-slate-50`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              My HMO Plan
            </Link>
          )}

          <Chip
            ref={planChipRef}
            active={planChipActive}
            onClick={togglePlanMenu}
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            trailingIcon={<ChevronDown className="h-4 w-4" aria-hidden="true" />}
            aria-haspopup="dialog"
            aria-expanded={planMenuOpen}
            aria-controls={planMenuId}
          >
            {planChipLabel}
          </Chip>

          <Chip
            active={only24Hours}
            onClick={() => update({ only24Hours: !only24Hours })}
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          >
            Open 24/7
          </Chip>
          <Chip
            active={onlyEmergency}
            onClick={() => update({ onlyEmergency: !onlyEmergency })}
            icon={<Ambulance className="h-4 w-4" aria-hidden="true" />}
          >
            Emergency
          </Chip>
        </div>

        {/* HMO & Plan panel. Rendered outside the strip (whose horizontal
            scroller would clip it) and placed under its chip from the chip's
            measured rectangle. */}
        {planMenu && (
          <div
            ref={planMenuRef}
            id={planMenuId}
            role="dialog"
            aria-label="Filter by HMO and plan"
            style={{ left: planMenu.left, top: planMenu.top }}
            className="pointer-events-auto absolute z-30 w-[300px] max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl bg-white p-3 text-slate-900 shadow-xl ring-1 ring-slate-900/5"
          >
            <SelectControl
              id="filter-hmo"
              label="HMO"
              value={hmoId}
              onChange={(value) => update({ hmoId: value || null })}
            >
              <option value="">All HMOs</option>
              {hmos.map((hmo) => (
                <option key={hmo.id} value={hmo.id}>
                  {hmo.name}
                </option>
              ))}
            </SelectControl>

            <SelectControl
              id="filter-plan"
              label="Plan"
              value={planTier}
              onChange={(value) => update({ planTier: value || null })}
            >
              <option value="">All plans</option>
              {PLAN_TIER_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.tiers.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectControl>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => update({ hmoId: null, planTier: null })}
                disabled={!planChipActive}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setPlanMenu(null)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Sub-components                             */
/* -------------------------------------------------------------------------- */

/** `shrink-0 whitespace-nowrap`: a chip is never squeezed or broken across lines. */
const CHIP_BASE =
  'pointer-events-auto inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium shadow-md ring-1 ring-slate-900/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1';

function Chip({
  ref,
  active,
  onClick,
  icon,
  trailingIcon,
  title,
  children,
  ...aria
}: {
  ref?: Ref<HTMLButtonElement>;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  title?: string;
  children: ReactNode;
  'aria-haspopup'?: 'dialog';
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={aria['aria-haspopup'] ? undefined : active}
      title={title}
      {...aria}
      className={`${CHIP_BASE} ${
        active
          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
          : 'bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  );
}

function SelectControl({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="block w-full appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
