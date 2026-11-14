'use client';

import type { MouseEvent, ReactNode } from 'react';
import {
  Ambulance,
  BadgeCheck,
  Building2,
  CircleDashed,
  Clock,
  Eye,
  FlaskConical,
  HeartPulse,
  MapPin,
  Navigation,
  Phone,
  Pill,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Stethoscope,
  Wallet,
} from 'lucide-react';
import {
  ALL_TIERS_WILDCARD,
  FACILITY_TYPE_INFO,
  describeCoverage,
  findHmoMatch,
  type FacilityWithHMO,
} from '@/lib/facilities';
import type { FacilityType } from '@/types/database';

export interface FacilityCardProps {
  facility: FacilityWithHMO;
  /** The patient's HMO, when an HMO filter or profile preference is active. */
  activeHmoId?: string | null;
  /** Display name of that HMO, for the coverage badges. */
  activeHmoName?: string | null;
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

/**
 * Label, icon and badge colours per facility type; shared with the discovery
 * drawer. Each badge uses the hue of that type's map pin, so a listing and
 * its pin read as the same thing.
 */
export const TYPE_META: Record<FacilityType, { label: string; icon: typeof Building2; pill: string }> = {
  hospital: {
    label: FACILITY_TYPE_INFO.hospital.label,
    icon: Building2,
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  },
  clinic: {
    label: FACILITY_TYPE_INFO.clinic.label,
    icon: Stethoscope,
    pill: 'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/30',
  },
  pharmacy: {
    label: FACILITY_TYPE_INFO.pharmacy.label,
    icon: Pill,
    pill: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30',
  },
  laboratory: {
    label: FACILITY_TYPE_INFO.laboratory.label,
    icon: FlaskConical,
    pill: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  },
  dental: {
    label: FACILITY_TYPE_INFO.dental.label,
    icon: Smile,
    pill: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
  },
  eye: {
    label: FACILITY_TYPE_INFO.eye.label,
    icon: Eye,
    pill: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/30',
  },
  specialist: {
    label: FACILITY_TYPE_INFO.specialist.label,
    icon: HeartPulse,
    pill: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30',
  },
};

export default function FacilityCard({
  facility,
  activeHmoId = null,
  activeHmoName = null,
  activePlanTier = null,
  isSelected = false,
  onSelect,
  onStartDirections,
  className = '',
}: FacilityCardProps) {
  const typeMeta = TYPE_META[facility.type];
  const TypeIcon = typeMeta.icon;

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
      className={`group relative flex w-full min-w-0 flex-col gap-4 rounded-lg border bg-white p-4 text-slate-900 shadow-sm transition-shadow sm:p-5 dark:bg-slate-900 dark:text-slate-100 ${
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
            <VerificationBadge verified={facility.is_verified} />
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
      <HmoCompatibility
        facility={facility}
        activeHmoId={activeHmoId}
        activeHmoName={activeHmoName}
        activePlanTier={activePlanTier}
      />

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

const VERIFIED_BADGE =
  'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30';
const UNCONFIRMED_BADGE =
  'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';

/**
 * Whether MedNet has confirmed a listing: a green "Verified" badge, or a
 * neutral "Unconfirmed" one that tells patients to call ahead. `xs` is the
 * compact size for list rows.
 */
export function VerificationBadge({
  verified,
  size = 'sm',
  className = '',
}: {
  verified: boolean;
  size?: 'sm' | 'xs';
  className?: string;
}) {
  const sizing = size === 'xs' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs';
  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return verified ? (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-medium ring-1 ring-inset ${sizing} ${VERIFIED_BADGE} ${className}`}
      title="Verified by MedNet"
    >
      <BadgeCheck className={iconSize} aria-hidden="true" />
      Verified
    </span>
  ) : (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-medium ring-1 ring-inset ${sizing} ${UNCONFIRMED_BADGE} ${className}`}
      title="MedNet has not confirmed this listing yet. Call the facility to check hours, services and plans before visiting."
    >
      <CircleDashed className={iconSize} aria-hidden="true" />
      Unconfirmed · Call to verify
      {/* The tooltip never reaches touch or screen-reader users; say it to them here. */}
      <span className="sr-only">
        . MedNet has not confirmed this listing yet. Call the facility to check hours, services
        and plans before visiting.
      </span>
    </span>
  );
}

const ACCEPTS_BADGE =
  'inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white';
const AMBER_NOTICE =
  'flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200';
const SLATE_NOTICE =
  'flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200';

/**
 * Coverage panel. With an HMO filter active: an emerald "Accepts" badge, an
 * amber notice when the facility takes that HMO only on other tiers, or a
 * neutral notice when the HMO is not in its network. Then the facility's
 * accepted plans, or self-pay when it lists none.
 */
export function HmoCompatibility({
  facility,
  activeHmoId = null,
  activeHmoName = null,
  activePlanTier = null,
}: {
  facility: FacilityWithHMO;
  activeHmoId?: string | null;
  activeHmoName?: string | null;
  activePlanTier?: string | null;
}) {
  const hmoId = activeHmoId?.trim() ?? '';
  const planTier = activePlanTier?.trim() ?? '';
  const status = hmoId ? describeCoverage(facility, hmoId, planTier) : null;
  // A plan filter without an HMO: any HMO that accepts a plan by that name.
  const tierMatch = !hmoId && planTier ? findHmoMatch(facility, null, planTier) : null;
  const rowHmoName = status && status.kind !== 'not-in-network' ? status.row.hmos?.name : undefined;
  const hmoName = activeHmoName?.trim() || rowHmoName || 'your HMO';
  const acceptedRow = status?.kind === 'covered' ? status.row : tierMatch;

  let notice: ReactNode = null;
  if (acceptedRow) {
    const name = status?.kind === 'covered' ? hmoName : (acceptedRow.hmos?.name ?? 'your HMO');
    const tiers = acceptedRow.accepted_tiers.map((t) => t.trim()).filter(Boolean);
    const acceptsAll = tiers.includes(ALL_TIERS_WILDCARD);
    notice = (
      <div className="space-y-1.5">
        <span className={ACCEPTS_BADGE}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Accepts {name}
          {planTier ? ` (${planTier})` : ''}
        </span>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {acceptsAll ? 'All plans covered.' : `Covers ${formatList(tiers)}.`}
        </p>
      </div>
    );
  } else if (status?.kind === 'other-tiers') {
    notice = (
      <div className={AMBER_NOTICE}>
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p>
          <span className="font-semibold">
            Accepts {hmoName}, but requires: {formatList(status.acceptedTiers)}.
          </span>{' '}
          {planTier ? `Your ${planTier} plan is not on that list.` : ''} Confirm with the facility
          before visiting.
        </p>
      </div>
    );
  } else if (status?.kind === 'not-in-network') {
    notice = (
      <div className={SLATE_NOTICE}>
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
        <p>
          <span className="font-semibold">Not in your {hmoName} network</span> · Self-pay or special
          retainership only
        </p>
      </div>
    );
  } else if (planTier) {
    notice = (
      <div className={AMBER_NOTICE}>
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p>Not listed for your {planTier} plan. Confirm coverage with the facility before visiting.</p>
      </div>
    );
  }

  const listed = facility.facility_hmos.filter((row) => row.hmos);

  return (
    <div className="space-y-2">
      {notice}

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
        !status && (
          <p className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Wallet className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            Self-Pay / Restricted Corporate Only
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
export function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
