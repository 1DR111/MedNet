import type { PlanTier } from '@/types/database';

/**
 * Plans a patient can hold, grouped for `<optgroup>` pickers.
 *
 * Single source of truth for the onboarding form and the discovery filter bar.
 * `'All'` is a facility-side wildcard, not a plan, so it is never offered here.
 */
export const PLAN_TIER_GROUPS = [
  {
    label: 'Corporate plans',
    tiers: ['Plus', 'Pro', 'Max', 'Pro Max', 'Magnum', 'Magnum Plus'],
  },
  {
    label: 'Retail plans',
    tiers: ['Strawberry', 'Cranberry', 'Blueberry', 'Blackberry', 'Raspberry'],
  },
] as const satisfies readonly { label: string; tiers: readonly PlanTier[] }[];

/** Union of every plan name listed in {@link PLAN_TIER_GROUPS}. */
export type PatientPlanTier = (typeof PLAN_TIER_GROUPS)[number]['tiers'][number];

/** Flat list of every selectable plan, in display order. */
export const PATIENT_PLAN_TIERS: readonly PatientPlanTier[] = PLAN_TIER_GROUPS.flatMap(
  (group) => group.tiers,
);

/** Narrows unknown input (form values, database text) to a known plan name. */
export function isPatientPlanTier(value: unknown): value is PatientPlanTier {
  return typeof value === 'string' && (PATIENT_PLAN_TIERS as readonly string[]).includes(value);
}
