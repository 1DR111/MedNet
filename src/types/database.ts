/**
 * Core database and domain types for the MedNet MVP
 * (patient-side healthcare discovery web app).
 *
 * These interfaces mirror the Supabase/Postgres tables used by the app
 * (snake_case column names) plus a few client-side helper types for the
 * discovery/filtering UI.
 */

/* -------------------------------------------------------------------------- */
/*                                Enumerations                                */
/* -------------------------------------------------------------------------- */

/** The kind of healthcare facility. */
export type FacilityType = 'hospital' | 'clinic' | 'pharmacy' | 'laboratory';

/**
 * Leadway Health plan names.
 *
 * Corporate plans: Plus, Pro, Max, Pro Max, Magnum, Magnum Plus.
 * Retail plans: Strawberry, Cranberry, Blueberry, Blackberry, Raspberry.
 */
export type LeadwayPlanTier =
  | 'Plus'
  | 'Pro'
  | 'Max'
  | 'Pro Max'
  | 'Magnum'
  | 'Magnum Plus'
  | 'Strawberry'
  | 'Cranberry'
  | 'Blueberry'
  | 'Blackberry'
  | 'Raspberry';

/**
 * HMO plan tier.
 *
 * Stored as free text in Postgres (`TEXT` / `TEXT[]`) so that each HMO can use
 * its real plan names. The known Leadway names are listed for autocompletion,
 * but any string is valid. `(string & {})` keeps the literal suggestions
 * visible in editors; a bare `string` would collapse the union.
 *
 * `'All'` is a wildcard used on a facility's accepted-tier list to indicate
 * that every plan of a given HMO is accepted.
 */
export type PlanTier = LeadwayPlanTier | 'All' | (string & {});

/* -------------------------------------------------------------------------- */
/*                                    HMOs                                    */
/* -------------------------------------------------------------------------- */

/** A Health Maintenance Organisation (e.g. Leadway Health). */
export interface Hmo {
  /** Primary key. UUID or a URL-safe slug, e.g. `'leadway'`. */
  id: string;
  /** Human-readable name, e.g. `'Leadway Health'`. */
  name: string;
  /** Short internal/industry code for the HMO. */
  code: string;
  /** Public URL of the HMO's logo image, if any. */
  logo_url?: string | null;
  /** ISO 8601 timestamp of when the row was created. */
  created_at?: string;
}

/** A specific plan offered by an HMO. */
export interface HmoPlan {
  /** Primary key. */
  id: string;
  /** Foreign key to {@link Hmo.id}. */
  hmo_id: string;
  /** Plan name, e.g. `'Leadway Pro'`. */
  name: string;
  /** Tier of this plan. */
  tier: PlanTier;
}

/**
 * Join row describing which HMO (and which of its tiers) a facility accepts.
 */
export interface FacilityHmo {
  /** Primary key. */
  id: string;
  /** Foreign key to {@link Facility.id}. */
  facility_id: string;
  /** Foreign key to {@link Hmo.id}. */
  hmo_id: string;
  /**
   * Plan tiers accepted at this facility for this HMO (Postgres `TEXT[]`).
   * May contain `'All'` to indicate every plan is accepted.
   */
  accepted_tiers: PlanTier[];
  /** The related HMO, present when the query joins the `hmos` table. */
  hmo?: Hmo;
}

/* -------------------------------------------------------------------------- */
/*                                 Facilities                                 */
/* -------------------------------------------------------------------------- */

/** A healthcare facility that patients can discover. */
export interface Facility {
  /** Primary key. */
  id: string;
  /** Facility name. */
  name: string;
  /** Kind of facility. */
  type: FacilityType;
  /** Free-text description of the facility, if provided. */
  description: string | null;
  /** Street address. */
  address: string;
  /** City the facility is located in. */
  city: string;
  /** State the facility is located in. */
  state: string;
  /** Latitude in decimal degrees (WGS 84). */
  latitude: number;
  /** Longitude in decimal degrees (WGS 84). */
  longitude: number;
  /** Primary contact phone number. */
  phone: string;
  /** Contact email address, if any. */
  email?: string | null;
  /** Public website URL, if any. */
  website?: string | null;
  /**
   * Human-readable operating hours,
   * e.g. `'24/7'` or `'Mon-Sat: 8:00 AM - 8:00 PM'`.
   */
  operating_hours: string;
  /** Whether the facility operates around the clock. */
  is_open_24_7: boolean;
  /** Whether the facility offers emergency services. */
  has_emergency_services: boolean;
  /** Whether the facility listing has been verified by MedNet. */
  is_verified: boolean;
  /** Average patient rating (typically 0-5). */
  rating: number;
  /** Number of reviews contributing to {@link Facility.rating}. */
  review_count: number;
  /**
   * Medical specialties offered,
   * e.g. `['General Practice', 'Pediatrics', 'Cardiology']`.
   */
  specialties: string[];
  /**
   * Services available on site,
   * e.g. `['Emergency Care', 'Pharmacy', 'Diagnostics', 'Maternity']`.
   */
  services: string[];
  /** Public URL of a cover image for the facility, if any. */
  image_url?: string | null;
  /**
   * HMOs accepted at this facility, present when the query joins the
   * `facility_hmos` table.
   */
  accepted_hmos?: FacilityHmo[];
  /**
   * Distance from the user's location in kilometres.
   * Computed client/server-side for location-based sorting; not a DB column.
   */
  distance_km?: number;
  /** ISO 8601 timestamp of when the row was created. */
  created_at?: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Patients                                  */
/* -------------------------------------------------------------------------- */

/** Profile data for a patient user. */
export interface PatientProfile {
  /** Primary key. Matches the Supabase Auth `user.id`. */
  id: string;
  /** Patient's email address. */
  email: string;
  /** Patient's full name. */
  full_name: string;
  /** Patient's phone number, if provided. */
  phone?: string | null;
  /** Whether the patient has HMO coverage. */
  has_hmo: boolean;
  /**
   * Foreign key to {@link Hmo.id}.
   * Optional for patients without HMO coverage.
   */
  hmo_id?: string | null;
  /** The patient's HMO plan name (Postgres `TEXT`), if covered. */
  hmo_plan_tier?: PlanTier | null;
  /** The patient's enrollee/member ID with their HMO, if covered. */
  hmo_enrollee_id?: string | null;
  /** Default city used for discovery when geolocation is unavailable. */
  default_city?: string | null;
  /** Whether the patient has completed the onboarding flow. */
  onboarding_completed: boolean;
  /** ISO 8601 timestamp of when the row was created. */
  created_at?: string;
  /** ISO 8601 timestamp of when the row was last updated. */
  updated_at?: string;
}
