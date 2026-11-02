'use client';

import type { ReactNode } from 'react';
import {
  Ambulance,
  Building2,
  ChevronDown,
  Clock,
  FlaskConical,
  LayoutGrid,
  Pill as PillIcon,
  Search,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import type { FacilityFilters } from '@/lib/facilities';
import { PLAN_TIER_GROUPS } from '@/lib/plans';
import type { FacilityType, Hmo, PatientProfile } from '@/types/database';

export interface FilterBarProps {
  filters: FacilityFilters;
  onFilterChange: (filters: FacilityFilters) => void;
  /** HMOs available in the HMO selector. */
  hmos: Hmo[];
  /** Signed-in patient, used for the one-click "My HMO Plan" toggle. */
  patientProfile?: PatientProfile | null;
  /** Number of facilities matching the current filters, if known. */
  resultCount?: number;
  className?: string;
}

type TypeOption = { value: FacilityType | 'all'; label: string; icon: typeof Building2 };

const TYPE_OPTIONS: readonly TypeOption[] = [
  { value: 'all', label: 'All', icon: LayoutGrid },
  { value: 'hospital', label: 'Hospital', icon: Building2 },
  { value: 'clinic', label: 'Clinic', icon: Stethoscope },
  { value: 'pharmacy', label: 'Pharmacy', icon: PillIcon },
  { value: 'laboratory', label: 'Laboratory', icon: FlaskConical },
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

export default function FilterBar({
  filters,
  onFilterChange,
  hmos,
  patientProfile = null,
  resultCount,
  className = '',
}: FilterBarProps) {
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

  const activeCount = [
    searchQuery.trim() !== '',
    facilityType !== 'all',
    hmoId !== '',
    planTier !== '',
    only24Hours,
    onlyEmergency,
  ].filter(Boolean).length;

  return (
    <section
      aria-label="Facility filters"
      className={`space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm ${className}`}
    >
      {/* Search + My HMO Plan */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="facility-search" className="sr-only">
            Search facilities
          </label>
          <Search
            className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="facility-search"
            type="search"
            value={searchQuery}
            onChange={(event) => update({ searchQuery: event.target.value })}
            placeholder="Search by hospital, clinic, pharmacy or Abuja area"
            autoComplete="off"
            className="block w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {canUseMyPlan && (
          <button
            type="button"
            onClick={toggleMyPlan}
            aria-pressed={myPlanActive}
            title={
              myPlanActive
                ? 'Clear your saved HMO plan from the filters'
                : `Only show facilities that accept ${savedHmoName}${savedTier ? ` ${savedTier}` : ''}`
            }
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
              myPlanActive
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight">
              <span>My HMO Plan</span>
              <span className={`text-[11px] font-normal ${myPlanActive ? 'text-emerald-100' : 'text-emerald-700'}`}>
                {savedHmoName}
                {savedTier ? ` · ${savedTier}` : ''}
              </span>
            </span>
          </button>
        )}
      </div>

      {/* Facility type */}
      <div role="group" aria-label="Facility type" className="flex flex-wrap gap-2">
        {TYPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = facilityType === option.value;
          return (
            <Pill
              key={option.value}
              active={active}
              onClick={() => update({ facilityType: option.value })}
              icon={<Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {option.label}
            </Pill>
          );
        })}
      </div>

      {/* HMO, plan, quick toggles, clear */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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

        <div role="group" aria-label="Quick filters" className="flex flex-wrap gap-2">
          <Pill
            active={only24Hours}
            onClick={() => update({ only24Hours: !only24Hours })}
            icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Open 24/7
          </Pill>
          <Pill
            active={onlyEmergency}
            onClick={() => update({ onlyEmergency: !onlyEmergency })}
            icon={<Ambulance className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Emergency Services
          </Pill>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 sm:ml-auto">
          {typeof resultCount === 'number' && (
            <span aria-live="polite">
              {resultCount} {resultCount === 1 ? 'facility' : 'facilities'}
            </span>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...EMPTY_FILTERS })}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear all ({activeCount})
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Sub-components                             */
/* -------------------------------------------------------------------------- */

function Pill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
        active
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800'
      }`}
    >
      {icon}
      {children}
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
    <div className="relative w-full sm:w-auto sm:min-w-[11rem]">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
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
  );
}
