'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  HeartPulse,
  Loader2,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import PlanCoverageCard from '@/components/PlanCoverageCard';
import { CITIES, DEFAULT_CITY, isKnownCity } from '@/lib/cities';
import { writeSavedCoverage } from '@/lib/coverage';
import { findPlan, getHmos, getPlansForHmo, groupPlansByCategory } from '@/lib/facilities';
import { createClient } from '@/lib/supabase/client';
import type { Hmo, PatientProfile } from '@/types/database';

type ExistingProfile = Pick<
  PatientProfile,
  | 'email'
  | 'full_name'
  | 'phone'
  | 'has_hmo'
  | 'hmo_id'
  | 'hmo_plan_tier'
  | 'default_city'
>;

type PageStatus = 'loading' | 'ready' | 'error';

export default function OnboardingPage() {
  const router = useRouter();

  const [status, setStatus] = useState<PageStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [existingProfile, setExistingProfile] = useState<ExistingProfile | null>(null);
  const [hmos, setHmos] = useState<Hmo[]>([]);

  const [hasHmo, setHasHmo] = useState(false);
  const [hmoId, setHmoId] = useState('');
  const [planTier, setPlanTier] = useState('');
  const [defaultCity, setDefaultCity] = useState<string>(DEFAULT_CITY);

  const [submitting, setSubmitting] = useState<'save' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !currentUser) {
        router.replace('/login');
        return;
      }

      const [hmoList, profileResult] = await Promise.all([
        getHmos(supabase),
        supabase
          .from('patient_profiles')
          .select(
            'email, full_name, phone, has_hmo, hmo_id, hmo_plan_tier, default_city',
          )
          .eq('id', currentUser.id)
          .maybeSingle()
          .overrideTypes<ExistingProfile, { merge: false }>(),
      ]);

      if (cancelled) return;

      if (profileResult.error) {
        setLoadError(`We could not load your profile: ${profileResult.error.message}`);
        setStatus('error');
        return;
      }

      setUser(currentUser);
      setHmos(hmoList);

      const profile = profileResult.data;
      setExistingProfile(profile);
      if (profile) {
        setHasHmo(profile.has_hmo);
        setHmoId(profile.hmo_id ?? '');
        // Only a plan the chosen HMO publishes can be shown in the picker.
        const savedHmo = hmoList.find((hmo) => hmo.id === profile.hmo_id);
        setPlanTier(findPlan(getPlansForHmo(savedHmo), profile.hmo_plan_tier)?.name ?? '');
        setDefaultCity(isKnownCity(profile.default_city) ? profile.default_city : DEFAULT_CITY);
      }

      setStatus('ready');
    }

    load().catch((err: unknown) => {
      if (cancelled) return;
      setLoadError(err instanceof Error ? err.message : 'Something went wrong while loading.');
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  function setCoverage(value: boolean) {
    setHasHmo(value);
    setError(null);
    if (!value) {
      setHmoId('');
      setPlanTier('');
    }
  }

  /** A plan belongs to one insurer, so a new HMO starts from its first plan. */
  function selectHmo(id: string) {
    setHmoId(id);
    setError(null);
    setPlanTier(getPlansForHmo(hmos.find((hmo) => hmo.id === id))[0]?.name ?? '');
  }

  async function persist(options: { skip: boolean }) {
    if (!user) return;

    const supabase = createClient();
    const metadata = user.user_metadata as { full_name?: unknown; phone?: unknown };
    const metaName = typeof metadata.full_name === 'string' ? metadata.full_name : '';
    const metaPhone = typeof metadata.phone === 'string' ? metadata.phone : null;

    // "Skip for now" must not wipe coverage a returning patient already saved,
    // so it carries the stored values forward. A first-time skip records no HMO.
    const coverage = options.skip
      ? {
          has_hmo: existingProfile?.has_hmo ?? false,
          hmo_id: existingProfile?.hmo_id ?? null,
          hmo_plan_tier: existingProfile?.hmo_plan_tier ?? null,
        }
      : {
          has_hmo: hasHmo,
          hmo_id: hasHmo ? hmoId : null,
          hmo_plan_tier: hasHmo && planTier ? planTier : null,
        };

    const payload = {
      id: user.id,
      email: existingProfile?.email ?? user.email ?? '',
      full_name: existingProfile?.full_name ?? metaName,
      phone: existingProfile?.phone ?? metaPhone,
      ...coverage,
      default_city: defaultCity,
      onboarding_completed: true,
    };

    const { error: upsertError } = await supabase
      .from('patient_profiles')
      .upsert(payload, { onConflict: 'id' });

    if (upsertError) {
      setError(`We could not save your preferences: ${upsertError.message}`);
      return;
    }

    // Mirror on this device so the map recognises the plan before its next
    // server round trip.
    writeSavedCoverage(coverage);

    router.push('/');
    router.refresh();
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (hasHmo) {
      if (!hmoId) {
        setError('Please select your HMO.');
        return;
      }
      if (!planTier) {
        setError('Please select your plan.');
        return;
      }
    }

    setSubmitting('save');
    try {
      await persist({ skip: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSkip() {
    setError(null);
    setSubmitting('skip');
    try {
      await persist({ skip: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(null);
    }
  }

  const busy = submitting !== null;
  const selectedHmo = hmos.find((h) => h.id === hmoId) ?? null;
  const plans = getPlansForHmo(selectedHmo);
  const selectedPlan = findPlan(plans, planTier);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
              <HeartPulse className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Personalise your search</h1>
            <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-300">
              Add your HMO plan and preferred city to see which facilities accept your coverage.
              You can update this at any time.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30 sm:p-8">
            {status === 'loading' && (
              <div
                role="status"
                className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-slate-500 dark:text-slate-400"
              >
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Loading your profile…
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{loadError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="w-full rounded-md border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Try again
                </button>
              </div>
            )}

            {status === 'ready' && (
              <form onSubmit={handleSave} className="space-y-6" noValidate>
                {/* Coverage question */}
                <fieldset>
                  <legend className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    Do you have Health Insurance (HMO) coverage?
                  </legend>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <ToggleOption
                      name="has_hmo"
                      value="yes"
                      checked={hasHmo}
                      onChange={() => setCoverage(true)}
                      title="Yes"
                      description="Show facilities that accept my plan"
                    />
                    <ToggleOption
                      name="has_hmo"
                      value="no"
                      checked={!hasHmo}
                      onChange={() => setCoverage(false)}
                      title="No"
                      description="Browse all facilities"
                    />
                  </div>
                </fieldset>

                {/* HMO details */}
                {hasHmo && (
                  <div className="space-y-4 rounded-md border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <SelectField
                      id="hmo_id"
                      label="Your HMO"
                      icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                      value={hmoId}
                      onChange={selectHmo}
                      required
                    >
                      <option value="" disabled>
                        {hmos.length ? 'Select your HMO' : 'No HMOs available yet'}
                      </option>
                      {hmos.map((hmo) => (
                        <option key={hmo.id} value={hmo.id}>
                          {hmo.name}
                        </option>
                      ))}
                    </SelectField>

                    <SelectField
                      id="hmo_plan_tier"
                      label="Your plan"
                      hint={selectedHmo ? `As shown on your ${selectedHmo.name} card` : undefined}
                      icon={<BadgeCheck className="h-4 w-4" aria-hidden="true" />}
                      value={planTier}
                      onChange={(value) => setPlanTier(findPlan(plans, value)?.name ?? '')}
                      disabled={!selectedHmo}
                      required
                    >
                      <option value="" disabled>
                        {selectedHmo ? 'Select your plan' : 'Select your HMO first'}
                      </option>
                      {groupPlansByCategory(plans).map((group) => (
                        <optgroup key={group.category} label={group.category}>
                          {group.plans.map((plan) => (
                            <option key={plan.name} value={plan.name}>
                              {plan.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </SelectField>

                    {selectedHmo && selectedPlan && (
                      <PlanCoverageCard hmo={selectedHmo} plan={selectedPlan} />
                    )}
                  </div>
                )}

                {/* Default city */}
                <SelectField
                  id="default_city"
                  label="Default city"
                  icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                  value={defaultCity}
                  onChange={(value) => setDefaultCity(value)}
                  hint="Used when location access is unavailable"
                >
                  {CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </SelectField>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900"
                  >
                    {submitting === 'save' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    {submitting === 'save' ? 'Saving…' : 'Save & Continue to MedNet'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={busy}
                    className="flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                  >
                    {submitting === 'skip' && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    )}
                    Skip for now
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Your plan details are only used to match you with facilities and are never shared.
          </p>
        </div>
      </main>
    </div>
  );
}

function ToggleOption({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col rounded-md border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-emerald-500/40 ${
        checked
          ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="text-sm font-semibold">{title}</span>
      <span
        className={`text-xs ${
          checked ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {description}
      </span>
    </label>
  );
}

function SelectField({
  id,
  label,
  icon,
  value,
  onChange,
  required,
  disabled,
  hint,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-xs text-slate-400 dark:text-slate-500">
            {hint}
          </span>
        )}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
          {icon}
        </span>
        <select
          id={id}
          name={id}
          value={value}
          required={required}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full appearance-none rounded-md border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-base text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
