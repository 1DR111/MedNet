'use client';

import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react';
import { formatList } from '@/components/FacilityCard';
import { CATEGORY_BADGE, HmoContacts, PlanFacts } from '@/components/PlanCoverageCard';
import {
  ALL_TIERS_WILDCARD,
  describeCoverage,
  findPlan,
  getPlansForHmo,
  type CoverageStatus,
  type FacilityHmoJoin,
  type FacilityWithHMO,
} from '@/lib/facilities';
import type { Hmo } from '@/types/database';

/**
 * The HMO section of a facility's details: where the patient's own plan
 * stands (covered, other tiers only, or not in the network), then every
 * accepted HMO with its tiers. A tier badge expands to that plan's benefits,
 * limits and pre-authorization rules without leaving the facility.
 */
export interface HmoNetworkProps {
  facility: FacilityWithHMO;
  /** Every HMO with its plan catalog, for the tier breakdown. */
  hmos: Hmo[];
  /** The patient's active or saved plan, if any. */
  coverage: { hmoId: string; planTier: string | null } | null;
}

type ListedJoin = FacilityHmoJoin & { hmos: NonNullable<FacilityHmoJoin['hmos']> };

const TIER_BUTTON =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';
const TIER_IDLE =
  'bg-slate-100 text-slate-700 ring-slate-900/5 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-700';
const TIER_OPEN =
  'bg-slate-800 text-white ring-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:ring-slate-200';
const TIER_MINE = 'bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700';

const NOTICE = 'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm';
const NOTICE_EMERALD =
  'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100';
const NOTICE_AMBER =
  'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100';
const NOTICE_SLATE =
  'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200';

export default function HmoNetwork({ facility, hmos, coverage }: HmoNetworkProps) {
  /** `${hmoId}::${tier}` of the one expanded tier, if any. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const panelId = useId();

  const listed = facility.facility_hmos.filter((row): row is ListedJoin => row.hmos !== null);
  const coverageHmo = coverage ? (hmos.find((hmo) => hmo.id === coverage.hmoId) ?? null) : null;
  const status =
    coverage && coverageHmo ? describeCoverage(facility, coverage.hmoId, coverage.planTier) : null;

  return (
    <div className="space-y-3">
      {coverage && coverageHmo && status && (
        <CoverageBanner hmo={coverageHmo} planTier={coverage.planTier} status={status} />
      )}

      {listed.length === 0 ? (
        <div className={`rounded-md border px-3 py-2.5 text-sm ${NOTICE_SLATE}`}>
          <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <Wallet className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            Self-Pay / Restricted Corporate Only
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            This facility has not listed any HMO plans. Expect to pay directly, or ask the facility
            about a corporate retainership.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Accepted HMO Plans
          </p>
          <ul className="space-y-2">
            {listed.map((row) => {
              // The full record (with the plan catalog) when the HMO list has
              // it; the embedded contact details otherwise.
              const hmo: Hmo = hmos.find((entry) => entry.id === row.hmo_id) ?? row.hmos;
              const plans = getPlansForHmo(hmo);
              const tiers = row.accepted_tiers.map((tier) => tier.trim()).filter(Boolean);
              const acceptsAll = tiers.includes(ALL_TIERS_WILDCARD);
              const mine = coverage?.hmoId === row.hmo_id;
              const myTier = mine ? (coverage?.planTier?.trim().toLowerCase() ?? '') : '';
              const prefix = `${row.hmo_id}::`;
              const openTier = expanded?.startsWith(prefix) ? expanded.slice(prefix.length) : null;
              const openPlan = openTier ? findPlan(plans, openTier) : null;

              return (
                <li
                  key={row.hmo_id}
                  className={`rounded-md border p-3 ${
                    mine
                      ? 'border-emerald-300 dark:border-emerald-800'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{hmo.name}</p>
                    {mine && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30">
                        Your HMO
                      </span>
                    )}
                  </div>

                  {acceptsAll ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      All {hmo.name} plans accepted.
                    </p>
                  ) : tiers.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Plans not specified.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tiers.map((tier) => {
                        const key = `${prefix}${tier}`;
                        const open = expanded === key;
                        const isMine = mine && tier.toLowerCase() === myTier;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setExpanded(open ? null : key)}
                            aria-expanded={open}
                            aria-controls={open ? panelId : undefined}
                            className={`${TIER_BUTTON} ${isMine ? TIER_MINE : open ? TIER_OPEN : TIER_IDLE}`}
                          >
                            {isMine && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
                            {tier}
                            {open ? (
                              <ChevronUp className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {openTier && (
                    <div
                      id={panelId}
                      className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {hmo.name} · {openTier}
                        </p>
                        {openPlan && <span className={CATEGORY_BADGE}>{openPlan.category}</span>}
                      </div>
                      <div className="mt-2">
                        {openPlan ? (
                          <PlanFacts plan={openPlan} compact />
                        ) : (
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {hmo.name} has not published details for this plan. Call the helpline to
                            confirm what it covers here.
                          </p>
                        )}
                      </div>
                      <HmoContacts hmo={hmo} className="mt-3" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Where the patient's own plan stands at this facility. */
function CoverageBanner({
  hmo,
  planTier,
  status,
}: {
  hmo: Hmo;
  planTier: string | null;
  status: CoverageStatus;
}) {
  const tier = planTier?.trim() || null;

  if (status.kind === 'covered') {
    return (
      <div className={`${NOTICE} ${NOTICE_EMERALD}`}>
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <p>
          <span className="font-semibold">
            {tier ? `Covered under your ${hmo.name} ${tier} plan` : `Accepts your ${hmo.name} plans`}
          </span>
          . Carry your enrollee ID; procedures listed under the plan rules still need the HMO&apos;s
          authorization code.
        </p>
      </div>
    );
  }

  if (status.kind === 'other-tiers') {
    return (
      <div className={`${NOTICE} ${NOTICE_AMBER}`}>
        <ShieldAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <p>
          <span className="font-semibold">
            This facility accepts {hmo.name}, but requires: {formatList(status.acceptedTiers)}
          </span>
          {tier ? `. Your ${tier} plan is not on that list.` : '.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`${NOTICE} ${NOTICE_SLATE}`}>
      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      <p>
        <span className="font-semibold">Not in your {hmo.name} network</span> · Self-pay or special
        retainership only
      </p>
    </div>
  );
}
