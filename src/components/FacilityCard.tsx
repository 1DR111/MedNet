'use client';

import type { MouseEvent, ReactNode } from 'react';
import {
  Ambulance,
  BadgeCheck,
  Building2,
  Clock,
  FlaskConical,
  MapPin,
  Navigation,
  Phone,
  Pill,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { ALL_TIERS_WILDCARD, findHmoMatch, type FacilityWithHMO } from '@/lib/facilities';
import type { FacilityType } from '@/types/database';

export interface FacilityCardProps {
  facility: FacilityWithHMO;
  /** The patient's HMO, when an HMO filter or profile preference is active. */
  activeHmoId?: string | null;
  /** The patient's plan name, when a plan filter or profile preference is active. */
  activePlanTier?: string | null;
  /** Highlights the card, e.g. when its marker is focused on the map. */
  isSelected?: boolean;
  /** Called when the card is activated; the map step will use this to pan. */
  onSelect?: (facility: FacilityWithHMO) => void;
  /** Opens in-app directions to this facility. The button is hidden without it. */
  onStartDirections?: (facility: FacilityWithHMO) => void;
  className?: string;
}

/** Label, icon and pill colours per facility type; shared with the discovery drawer. */
export const TYPE_META: Record<FacilityType, { label: string; icon: typeof Building2; pill: string }> = {
  hospital: {
    label: 'Hospital',
    icon: Building2,
    pill: 'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/30',
  },
  clinic: {
    label: 'Clinic',
    icon: Stethoscope,
    pill: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  },
  pharmacy: {
    label: 'Pharmacy',
    icon: Pill,
    pill: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30',
  },
  laboratory: {
    label: 'Laboratory',
    icon: FlaskConical,
    pill: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  },
};

export default function FacilityCard({
  facility,
  activeHmoId = null,
  activePlanTier = null,
  isSelected = false,
  onSelect,
  onStartDirections,
  className = '',
}: FacilityCardProps) {
  const typeMeta = TYPE_META[facility.type];
  const TypeIcon = typeMeta.icon;

  const hasActiveCoverage = Boolean(activeHmoId?.trim() || activePlanTier?.trim());
  const match = hasActiveCoverage ? findHmoMatch(facility, activeHmoId, activePlanTier) : null;

  const phoneHref = facility.phone ? `tel:${facility.phone.replace(/[^\d+]/g, '')}` : null;

  function handleSelect() {
    onSelect?.(facility);
  }

  /** Links inside the card must not also trigger the card's select action. */
  function stopSelect(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <article
      onClick={onSelect ? handleSelect : undefined}
      data-selected={isSelected || undefined}
      className={`group relative flex flex-col gap-4 rounded-lg border bg-white p-5 text-slate-900 shadow-sm transition-shadow dark:bg-slate-900 dark:text-slate-100 ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:hover:border-slate-700'
      } ${onSelect ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {onSelect ? (
              <button
                type="button"
                onClick={(event) => {
                  stopSelect(event);
                  handleSelect();
                }}
                aria-pressed={isSelected}
                className="truncate rounded-sm text-left text-base font-semibold text-slate-900 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
              >
                {facility.name}
              </button>
            ) : (
              <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                {facility.name}
              </h3>
            )}
            {facility.is_verified && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30"
                title="Verified by MedNet"
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Verified
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${typeMeta.pill}`}
            >
              <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {typeMeta.label}
            </span>
            {typeof facility.distance_km === 'number' && (
              <span className="text-slate-500 dark:text-slate-400">
                {formatDistance(facility.distance_km)} away
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Location and hours */}
      <dl className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Address</dt>
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <dd>
            {facility.address}, {facility.city}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">Operating hours</dt>
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <dd className="flex flex-wrap items-center gap-2">
            <span>{facility.operating_hours}</span>
            {facility.is_open_24_7 && <Badge tone="teal">Open 24/7</Badge>}
            {facility.has_emergency_services && (
              <Badge tone="red" icon={<Ambulance className="h-3.5 w-3.5" aria-hidden="true" />}>
                Emergency services
              </Badge>
            )}
          </dd>
        </div>
      </dl>

      {/* Specialties (first few; the details view lists them all) */}
      <SpecialtyPills specialties={facility.specialties} />

      {/* HMO compatibility */}
      <HmoCompatibility facility={facility} hasActiveCoverage={hasActiveCoverage} match={match} />

      {/* Actions */}
      <footer className="mt-auto flex flex-wrap gap-2 pt-1">
        {onStartDirections && (
          <button
            type="button"
            onClick={(event) => {
              stopSelect(event);
              onStartDirections(facility);
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Get Directions
            <span className="sr-only"> to {facility.name}</span>
          </button>
        )}
        {phoneHref && (
          <a
            href={phoneHref}
            onClick={stopSelect}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-200 dark:focus-visible:ring-offset-slate-900"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            Call
            <span className="sr-only"> {facility.name} on {facility.phone}</span>
          </a>
        )}
      </footer>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Sub-components                             */
/* -------------------------------------------------------------------------- */

/** Coverage panel: match for the active plan, or the facility's accepted plans. */
export function HmoCompatibility({
  facility,
  hasActiveCoverage,
  match,
}: {
  facility: FacilityWithHMO;
  hasActiveCoverage: boolean;
  match: ReturnType<typeof findHmoMatch>;
}) {
  if (match) {
    const hmoName = match.hmos?.name ?? 'your HMO';
    const tiers = match.accepted_tiers.map((t) => t.trim());
    const acceptsAll = tiers.includes(ALL_TIERS_WILDCARD);
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <p>
          <span className="font-semibold">Accepts your {hmoName} plan.</span>{' '}
          <span className="text-emerald-700 dark:text-emerald-300">
            {acceptsAll ? 'All plans covered.' : `Covers ${formatList(tiers)}.`}
          </span>
        </p>
      </div>
    );
  }

  const listed = facility.facility_hmos.filter((row) => row.hmos);

  return (
    <div className="space-y-2">
      {hasActiveCoverage && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p>Not listed for your plan. Confirm coverage with the facility before visiting.</p>
        </div>
      )}

      {listed.length > 0 ? (
        <div className="text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Accepted HMO plans
          </p>
          <ul className="space-y-1 text-slate-700 dark:text-slate-300">
            {listed.map((row) => {
              const tiers = row.accepted_tiers.map((t) => t.trim());
              const acceptsAll = tiers.includes(ALL_TIERS_WILDCARD);
              return (
                <li key={row.hmo_id} className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">{row.hmos?.name}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}
                      · {acceptsAll ? 'All plans' : tiers.length ? tiers.join(', ') : 'Plans not specified'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        !hasActiveCoverage && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No HMO plans listed. Direct payment only.
          </p>
        )
      )}
    </div>
  );
}

/**
 * Subtle pills for a facility's specialties, capped at `limit` with a
 * "+n more" hint. Renders nothing when there are no specialties.
 */
export function SpecialtyPills({
  specialties,
  limit = 3,
  className = '',
}: {
  specialties: readonly string[] | null | undefined;
  limit?: number;
  className?: string;
}) {
  const items = (specialties ?? []).map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) return null;
  const shown = items.slice(0, limit);
  const hidden = items.length - shown.length;

  return (
    <ul aria-label="Specialties" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {shown.map((item) => (
        <li
          key={item}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-900/5 dark:bg-slate-800 dark:text-slate-300 dark:ring-white/10"
        >
          {item}
        </li>
      ))}
      {hidden > 0 && (
        <li
          className="text-[11px] text-slate-400 dark:text-slate-500"
          title={items.slice(limit).join(', ')}
        >
          +{hidden} more
        </li>
      )}
    </ul>
  );
}

function Badge({
  tone,
  icon,
  children,
}: {
  tone: 'teal' | 'red';
  icon?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/30',
    red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/** "850 m", "2.4 km", "12 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** "Plus", "Plus and Pro", "Plus, Pro and Max". */
function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
