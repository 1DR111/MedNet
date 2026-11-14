'use client';

import { Check, ExternalLink, Phone, ShieldAlert } from 'lucide-react';
import type { Hmo, HmoPlanDetail } from '@/types/database';

/** `tel:` link for a helpline stored as dialled, e.g. "07002779800". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** "07002779800" reads as "0700 277 9800"; anything else is left as stored. */
export function formatPhone(phone: string): string {
  const digits = phone.trim();
  return /^0\d{10}$/.test(digits)
    ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    : digits;
}

/** Product-line badge, e.g. "Retail", "Corporate", "Maternity Plan". */
export const CATEGORY_BADGE =
  'inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/30';

const CONTACT_LINK =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-200';

/**
 * What one plan covers and the rules attached to it: summary, benefit list
 * and the pre-authorization and waiting-period box. Shared by the coverage
 * card in onboarding and settings and by the tier breakdown in facility
 * details, so a tier reads the same everywhere.
 */
export function PlanFacts({ plan, compact = false }: { plan: HmoPlanDetail; compact?: boolean }) {
  return (
    <div className={`space-y-3 ${compact ? 'text-xs' : 'text-sm'}`}>
      <p className="leading-relaxed text-slate-700 dark:text-slate-300">{plan.summary}</p>
      {plan.benefits.length > 0 && (
        <ul aria-label="Covered benefits" className="space-y-1.5">
          {plan.benefits.map((benefit, index) => (
            <li
              key={`${index}-${benefit}`}
              className="flex items-start gap-2 text-slate-700 dark:text-slate-300"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/40">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Pre-Authorization & Waiting Period Rules
        </h4>
        <p className="mt-1 leading-relaxed text-amber-900 dark:text-amber-100">{plan.restrictions}</p>
      </div>
    </div>
  );
}

/** Helpline and website links for an HMO; renders nothing when it lists neither. */
export function HmoContacts({
  hmo,
  className = '',
}: {
  hmo: Pick<Hmo, 'name' | 'helpline' | 'website'>;
  className?: string;
}) {
  const helpline = hmo.helpline?.trim() || null;
  const website = hmo.website?.trim() || null;
  if (!helpline && !website) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {helpline && (
        <a href={telHref(helpline)} className={CONTACT_LINK}>
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          Helpline {formatPhone(helpline)}
          <span className="sr-only"> for {hmo.name}</span>
        </a>
      )}
      {website && (
        <a href={website} target="_blank" rel="noopener noreferrer" className={CONTACT_LINK}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Official website
          <span className="sr-only"> of {hmo.name} (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

/**
 * "Plan Coverage & Rules": the selected plan's category, summary, benefits,
 * rules and the HMO's contacts, shown under the plan picker so a patient can
 * check the card in their hand against what the plan is said to cover.
 */
export default function PlanCoverageCard({
  hmo,
  plan,
  className = '',
}: {
  hmo: Hmo;
  plan: HmoPlanDetail;
  className?: string;
}) {
  return (
    <section
      aria-label={`Plan coverage and rules for ${hmo.name} ${plan.name}`}
      className={`rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Plan Coverage & Rules
          </h3>
          <p className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">
            {hmo.name} · {plan.name}
          </p>
        </div>
        <span className={CATEGORY_BADGE}>{plan.category}</span>
      </div>
      <div className="mt-3">
        <PlanFacts plan={plan} />
      </div>
      <HmoContacts hmo={hmo} className="mt-3" />
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Limits and rules as published by {hmo.name}. Confirm them with the HMO before treatment.
      </p>
    </section>
  );
}
