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

/** In-memory filter options understood by {@link filterFacilities}. */
export interface FacilityFilters {
  /** Case-insensitive substring match against name, address, city or any specialty. */
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

  return data ?? [];
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
      // "Pediatrics", "Eye" or "Maternity" should find a facility by what it
      // treats, not only by what it is called or where it is.
      const haystack = [
        facility.name,
        facility.address,
        facility.city,
        ...(facility.specialties ?? []),
      ];
      if (!haystack.some((field) => field.toLowerCase().includes(query))) return false;
    }

    if ((hmoId || planTier) && !findHmoMatch(facility, hmoId, planTier)) return false;

    return true;
  });
}
