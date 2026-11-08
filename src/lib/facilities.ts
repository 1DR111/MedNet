import type { SupabaseClient } from '@supabase/supabase-js';
import type { Facility, FacilityType, Hmo, PlanTier } from '@/types/database';

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

/** One row of the `facility_hmos` join as returned by {@link FACILITY_SELECT}. */
export interface FacilityHmoJoin {
  /** Foreign key to {@link Hmo.id}. */
  hmo_id: string;
  /** Plans accepted for this HMO; may contain `'All'` as a wildcard. */
  accepted_tiers: PlanTier[];
  /** The embedded HMO. `null` only if the referenced row is missing. */
  hmos: Pick<Hmo, 'id' | 'name' | 'code'> | null;
}

/** A facility with its accepted HMOs embedded. */
export interface FacilityWithHMO extends Facility {
  facility_hmos: FacilityHmoJoin[];
}

/* -------------------------------------------------------------------------- */
/*                               Facility types                               */
/* -------------------------------------------------------------------------- */

/** How one facility category is named and drawn, shared by chips, cards, pins and the legend. */
export interface FacilityTypeInfo {
  /** Singular label for a listing: "Hospital", "Eye Care". */
  label: string;
  /** Filter chip and legend label: "Hospitals", "Eye Care". */
  plural: string;
  /** Letter inside the map pin and the legend key. */
  initial: string;
  /** Solid pin colour (Tailwind 600 shades). */
  color: string;
  /** Other ways patients write this category; search matches them like the label. */
  terms: string[];
}

/**
 * Every facility category, in the order the filter chips and the map legend
 * list them. `Record<FacilityType, ...>` keeps the table exhaustive: a kind
 * added to {@link FacilityType} without a row here is a compile error.
 */
export const FACILITY_TYPE_INFO: Record<FacilityType, FacilityTypeInfo> = {
  // Colours are Tailwind 600 shades: emerald, teal, violet, amber, sky, indigo, rose.
  hospital: { label: 'Hospital', plural: 'Hospitals', initial: 'H', color: '#059669', terms: [] },
  clinic: { label: 'Clinic', plural: 'Clinics', initial: 'C', color: '#0d9488', terms: [] },
  pharmacy: { label: 'Pharmacy', plural: 'Pharmacies', initial: 'P', color: '#7c3aed', terms: ['Chemist'] },
  laboratory: {
    label: 'Laboratory',
    plural: 'Labs',
    initial: 'L',
    color: '#d97706',
    terms: ['Laboratories', 'Lab'],
  },
  dental: {
    label: 'Dental Clinic',
    plural: 'Dental',
    initial: 'D',
    color: '#0284c7',
    terms: ['Dentist', 'Dental Clinics'],
  },
  eye: {
    label: 'Eye Care',
    plural: 'Eye Care',
    initial: 'E',
    color: '#4f46e5',
    terms: ['Eye Clinic', 'Eye Clinics', 'Optician'],
  },
  specialist: {
    label: 'Specialist Centre',
    plural: 'Specialist',
    initial: 'S',
    color: '#e11d48',
    terms: ['Specialist Centres', 'Specialist Care'],
  },
};

/** The categories in display order. */
export const FACILITY_TYPES = Object.keys(FACILITY_TYPE_INFO) as FacilityType[];

/** True for a string the app knows as a facility category. */
export function isFacilityType(value: unknown): value is FacilityType {
  return typeof value === 'string' && (FACILITY_TYPES as readonly string[]).includes(value);
}

/** In-memory filter options understood by {@link filterFacilities}. */
export interface FacilityFilters {
  /**
   * Case-insensitive substring match against name, address, city, category
   * label, and every specialty and service.
   */
  searchQuery?: string;
  /** Restrict to one facility type; `'all'` or `undefined` means no restriction. */
  facilityType?: FacilityType | 'all';
  /** Only facilities that list this HMO. `null` or `undefined` means any. */
  hmoId?: string | null;
  /**
   * Only facilities whose accepted tiers (for the chosen HMO, or any HMO when
   * `hmoId` is not set) contain this plan exactly, or the `'All'` wildcard.
   */
  planTier?: string | null;
  /** Only facilities open around the clock. */
  only24Hours?: boolean;
  /** Only facilities with emergency services. */
  onlyEmergency?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  Fetching                                  */
/* -------------------------------------------------------------------------- */

/** Column list used for every facility query, so types and query stay in sync. */
export const FACILITY_SELECT = '*, facility_hmos(hmo_id, accepted_tiers, hmos(id, name, code))';

/**
 * Loads every facility with its accepted HMOs, ordered by name.
 *
 * Works with either the browser or the server Supabase client.
 * Throws if the query fails so callers can surface a single error path.
 */
export async function fetchFacilitiesWithHMOs(supabase: SupabaseClient): Promise<FacilityWithHMO[]> {
  const { data, error } = await supabase
    .from('facilities')
    .select(FACILITY_SELECT)
    .order('name', { ascending: true })
    .overrideTypes<FacilityWithHMO[], { merge: false }>();

  if (error) {
    throw new Error(`Could not load facilities: ${error.message}`);
  }

  // A row whose `type` the app does not know (a typo, or a category added in
  // the database before the code) has no label, icon or pin colour, so it is
  // left out rather than breaking the whole dashboard. The server log names
  // it so the row can be fixed.
  const rows = data ?? [];
  const skipped = rows.filter((facility) => !isFacilityType(facility.type));
  if (skipped.length > 0) {
    console.warn(
      `Skipped ${skipped.length} facility row(s) with an unknown type: ${skipped
        .map((facility) => `${facility.name} (${String(facility.type)})`)
        .join(', ')}`,
    );
    return rows.filter((facility) => isFacilityType(facility.type));
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/*                                  Matching                                  */
/* -------------------------------------------------------------------------- */

/** Wildcard a facility can list instead of individual plan names. */
export const ALL_TIERS_WILDCARD = 'All';

/** Normalises user or database input for exact plan-name comparison. */
function normaliseTier(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** True when `acceptedTiers` covers `planTier` exactly, or lists the wildcard. */
export function tiersAcceptPlan(acceptedTiers: readonly string[], planTier: string): boolean {
  const wanted = normaliseTier(planTier);
  if (!wanted) return true;
  return acceptedTiers.some((tier) => {
    const accepted = normaliseTier(tier);
    return accepted === ALL_TIERS_WILDCARD || accepted === wanted;
  });
}

/**
 * Finds the `facility_hmos` row that satisfies the given HMO and/or plan.
 *
 * - Both set: the row must be for that HMO and accept that plan.
 * - Only `hmoId`: any row for that HMO.
 * - Only `planTier`: any row accepting that plan.
 * - Neither: `null` (there is nothing to match against).
 */
export function findHmoMatch(
  facility: Pick<FacilityWithHMO, 'facility_hmos'>,
  hmoId?: string | null,
  planTier?: string | null,
): FacilityHmoJoin | null {
  const wantedHmo = (hmoId ?? '').trim();
  const wantedTier = normaliseTier(planTier);
  if (!wantedHmo && !wantedTier) return null;

  return (
    facility.facility_hmos.find((row) => {
      if (wantedHmo && row.hmo_id !== wantedHmo) return false;
      if (wantedTier && !tiersAcceptPlan(row.accepted_tiers, wantedTier)) return false;
      return true;
    }) ?? null
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Filtering                                 */
/* -------------------------------------------------------------------------- */

/**
 * Filters facilities in memory. Pure: never mutates its inputs and returns a
 * new array. Every filter is optional; unset filters are ignored.
 */
export function filterFacilities(
  facilities: readonly FacilityWithHMO[],
  filters: FacilityFilters,
): FacilityWithHMO[] {
  const query = (filters.searchQuery ?? '').trim().toLowerCase();
  const type = filters.facilityType && filters.facilityType !== 'all' ? filters.facilityType : null;
  const hmoId = (filters.hmoId ?? '').trim() || null;
  const planTier = normaliseTier(filters.planTier) || null;
  const only24Hours = filters.only24Hours === true;
  const onlyEmergency = filters.onlyEmergency === true;

  return facilities.filter((facility) => {
    if (type && facility.type !== type) return false;
    if (only24Hours && !facility.is_open_24_7) return false;
    if (onlyEmergency && !facility.has_emergency_services) return false;

    if (query) {
      // "Galadimawa", "Dental", "Eye" or "Ultrasound" should find a facility
      // by where it is, what kind it is, what it treats and what it offers,
      // not only by what it is called.
      const info = FACILITY_TYPE_INFO[facility.type];
      const haystack = [
        facility.name,
        facility.address,
        facility.city,
        info.label,
        info.plural,
        ...info.terms,
        ...(facility.specialties ?? []),
        ...(facility.services ?? []),
      ];
      if (!haystack.some((field) => field.toLowerCase().includes(query))) return false;
    }

    if ((hmoId || planTier) && !findHmoMatch(facility, hmoId, planTier)) return false;

    return true;
  });
}
