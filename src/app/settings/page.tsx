'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User as AuthUser } from '@supabase/supabase-js';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  LogIn,
  LogOut,
  Loader2,
  Mail,
  Map as MapIcon,
  MapPin,
  Monitor,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { CITIES, DEFAULT_CITY, isKnownCity } from '@/lib/cities';
import { clearSavedCoverage, readSavedCoverage, writeSavedCoverage } from '@/lib/coverage';
import { PLAN_TIER_GROUPS, isPatientPlanTier, type PatientPlanTier } from '@/lib/plans';
import { createClient } from '@/lib/supabase/client';
import type { Theme } from '@/lib/theme';
import type { Hmo, PatientProfile } from '@/types/database';

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

type ProfileRow = Pick<
  PatientProfile,
  'email' | 'full_name' | 'phone' | 'has_hmo' | 'hmo_id' | 'hmo_plan_tier' | 'default_city'
>;

const PROFILE_COLUMNS = 'email, full_name, phone, has_hmo, hmo_id, hmo_plan_tier, default_city';

type PageStatus = 'loading' | 'ready' | 'error';

const THEME_OPTIONS: { value: Theme; label: string; description: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System default', description: 'Follows your device setting', icon: Monitor },
  { value: 'light', label: 'Light mode', description: 'Always light', icon: Sun },
  { value: 'dark', label: 'Dark mode', description: 'Always dark', icon: Moon },
];

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

export default function SettingsPage() {
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [status, setStatus] = useState<PageStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [hmos, setHmos] = useState<Hmo[]>([]);

  // HMO coverage form
  const [hasHmo, setHasHmo] = useState(false);
  const [hmoId, setHmoId] = useState('');
  const [planTier, setPlanTier] = useState<PatientPlanTier | ''>('');
  const [hmoSaving, setHmoSaving] = useState(false);
  const [hmoSaved, setHmoSaved] = useState(false);
  const [hmoError, setHmoError] = useState<string | null>(null);

  // Account form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultCity, setDefaultCity] = useState<string>(DEFAULT_CITY);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  /* --------------------------------- Load --------------------------------- */

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      const [hmoResult, profileResult] = await Promise.all([
        supabase
          .from('hmos')
          .select('id, name, code, logo_url, created_at')
          .order('name', { ascending: true })
          .overrideTypes<Hmo[], { merge: false }>(),
        currentUser
          ? supabase
              .from('patient_profiles')
              .select(PROFILE_COLUMNS)
              .eq('id', currentUser.id)
              .maybeSingle()
              .overrideTypes<ProfileRow, { merge: false }>()
          : null,
      ]);
      if (cancelled) return;

      if (hmoResult.error) {
        setLoadError(`We could not load the list of HMOs: ${hmoResult.error.message}`);
        setStatus('error');
        return;
      }
      if (profileResult?.error) {
        setLoadError(`We could not load your profile: ${profileResult.error.message}`);
        setStatus('error');
        return;
      }

      setUser(currentUser ?? null);
      setHmos(hmoResult.data ?? []);

      const row = profileResult?.data ?? null;
      setProfile(row);

      // Coverage: the account row wins; the on-device mirror covers guests and
      // accounts whose row has not been written yet.
      const coverage = row ?? readSavedCoverage();
      if (coverage) {
        setHasHmo(coverage.has_hmo);
        setHmoId(coverage.hmo_id ?? '');
        setPlanTier(isPatientPlanTier(coverage.hmo_plan_tier) ? coverage.hmo_plan_tier : '');
      }
      if (row) {
        setFullName(row.full_name);
        setPhone(row.phone ?? '');
        setDefaultCity(isKnownCity(row.default_city) ? row.default_city : DEFAULT_CITY);
      } else if (currentUser) {
        const metadata = currentUser.user_metadata as { full_name?: unknown; phone?: unknown };
        setFullName(typeof metadata.full_name === 'string' ? metadata.full_name : '');
        setPhone(typeof metadata.phone === 'string' ? metadata.phone : '');
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
  }, []);

  /* ------------------------------- Handlers ------------------------------- */

  function setCoverage(value: boolean) {
    setHasHmo(value);
    setHmoSaved(false);
    setHmoError(null);
    if (!value) {
      setHmoId('');
      setPlanTier('');
    }
  }

  /** Full row for upsert: existing values carried forward, overrides applied. */
  function buildProfilePayload(currentUser: AuthUser, overrides: Partial<ProfileRow>) {
    const metadata = currentUser.user_metadata as { full_name?: unknown; phone?: unknown };
    return {
      id: currentUser.id,
      email: profile?.email ?? currentUser.email ?? '',
      full_name:
        profile?.full_name ?? (typeof metadata.full_name === 'string' ? metadata.full_name : ''),
      phone: profile?.phone ?? (typeof metadata.phone === 'string' ? metadata.phone : null),
      has_hmo: profile?.has_hmo ?? false,
      hmo_id: profile?.hmo_id ?? null,
      hmo_plan_tier: profile?.hmo_plan_tier ?? null,
      default_city: profile?.default_city ?? DEFAULT_CITY,
      onboarding_completed: true,
      ...overrides,
    };
  }

  async function saveHmo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHmoError(null);
    setHmoSaved(false);

    if (hasHmo && !hmoId) {
      setHmoError('Please select your HMO.');
      return;
    }
    if (hasHmo && !planTier) {
      setHmoError('Please select your plan.');
      return;
    }

    const coverage = {
      has_hmo: hasHmo,
      hmo_id: hasHmo ? hmoId : null,
      hmo_plan_tier: hasHmo && planTier ? planTier : null,
    };

    setHmoSaving(true);
    try {
      if (user) {
        const supabase = createClient();
        const payload = buildProfilePayload(user, coverage);
        const { error } = await supabase
          .from('patient_profiles')
          .upsert(payload, { onConflict: 'id' });
        if (error) {
          setHmoError(`We could not save your HMO settings: ${error.message}`);
          return;
        }
        setProfile((current) => ({ ...(current ?? payload), ...coverage }));
      }
      // Mirror on this device so the map recognises the plan instantly.
      writeSavedCoverage(coverage);
      setHmoSaved(true);
      // The map page is server-rendered with the profile; refresh its data.
      router.refresh();
    } catch (err) {
      setHmoError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setHmoSaving(false);
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setAccountError(null);
    setAccountSaved(false);

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setAccountError('Please enter your full name.');
      return;
    }

    setAccountSaving(true);
    try {
      const supabase = createClient();
      const overrides = {
        full_name: trimmedName,
        phone: phone.trim() || null,
        default_city: isKnownCity(defaultCity) ? defaultCity : DEFAULT_CITY,
      };
      const payload = buildProfilePayload(user, overrides);
      const { error } = await supabase
        .from('patient_profiles')
        .upsert(payload, { onConflict: 'id' });
      if (error) {
        setAccountError(`We could not save your details: ${error.message}`);
        return;
      }
      setProfile((current) => ({ ...(current ?? payload), ...overrides }));
      setAccountSaved(true);
      router.refresh();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setAccountSaving(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      setAccountError(`Could not sign out: ${error.message}`);
      return;
    }
    // The on-device mirror belongs to the account that just left.
    clearSavedCoverage();
    router.push('/');
    router.refresh();
  }

  function returnToMap() {
    router.push('/');
    router.refresh();
  }

  /* --------------------------------- Render ------------------------------- */

  const selectedHmo = hmos.find((hmo) => hmo.id === hmoId) ?? null;
  const loading = status === 'loading';

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Map
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {status === 'error' && (
          <Alert tone="error">{loadError}</Alert>
        )}

        {/* 1. Appearance */}
        <SettingsSection
          id="appearance"
          title="Appearance"
          description={`Currently showing the ${resolvedTheme} theme${theme === 'system' ? ', from your device setting' : ''}.`}
        >
          <div role="group" aria-label="Theme" className="grid gap-2 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  aria-pressed={active}
                  className={`flex items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:flex-col sm:items-start sm:gap-2 ${
                    active
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {option.label}
                      {active && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label="Active" />
                      )}
                    </span>
                    <span
                      className={`block text-xs ${
                        active ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsSection>

        {/* 2. HMO coverage */}
        <SettingsSection
          id="hmo"
          title="Health Insurance (HMO) Coverage"
          description={
            user
              ? 'Saved to your account and used to show which facilities accept your plan.'
              : 'Saved on this device. Sign in to keep it on every device.'
          }
        >
          {loading ? (
            <LoadingRow label="Loading your coverage…" />
          ) : (
            <form onSubmit={saveHmo} className="space-y-5" noValidate>
              <fieldset>
                <legend className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Do you have HMO coverage?
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

              {hasHmo && (
                <div className="space-y-4 rounded-md border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <SelectField
                    id="hmo_id"
                    label="Your HMO provider"
                    icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                    value={hmoId}
                    onChange={(value) => {
                      setHmoId(value);
                      setHmoSaved(false);
                    }}
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
                    label="Your plan tier"
                    hint={selectedHmo ? `As shown on your ${selectedHmo.name} card` : undefined}
                    icon={<BadgeCheck className="h-4 w-4" aria-hidden="true" />}
                    value={planTier}
                    onChange={(value) => {
                      setPlanTier(isPatientPlanTier(value) ? value : '');
                      setHmoSaved(false);
                    }}
                    required
                  >
                    <option value="" disabled>
                      Select your plan
                    </option>
                    {PLAN_TIER_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.tiers.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </SelectField>
                </div>
              )}

              {hmoError && <Alert tone="error">{hmoError}</Alert>}

              {hmoSaved ? (
                <div className="flex flex-col gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    Saved
                  </span>
                  <button
                    type="button"
                    onClick={returnToMap}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
                  >
                    <MapIcon className="h-4 w-4" aria-hidden="true" />
                    Return to Map with My HMO
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={hmoSaving}
                  className={PRIMARY_BUTTON}
                >
                  {hmoSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {hmoSaving ? 'Saving…' : 'Save HMO Settings'}
                </button>
              )}
            </form>
          )}
        </SettingsSection>

        {/* 3. Account & location */}
        <SettingsSection
          id="account"
          title="Account & Location"
          description={
            user
              ? 'Your sign-in email, contact details and default city.'
              : 'You are browsing as a guest.'
          }
        >
          {loading ? (
            <LoadingRow label="Loading your account…" />
          ) : user ? (
            <form onSubmit={saveAccount} className="space-y-4" noValidate>
              <Field id="email" label="Email" icon={<Mail className="h-4 w-4" aria-hidden="true" />}>
                <input
                  id="email"
                  type="email"
                  value={user.email ?? profile?.email ?? ''}
                  readOnly
                  className={`${INPUT_CLASS} cursor-not-allowed bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400`}
                />
              </Field>
              <Field id="full_name" label="Full name" icon={<User className="h-4 w-4" aria-hidden="true" />}>
                <input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    setAccountSaved(false);
                  }}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field
                id="phone"
                label="Phone number"
                hint="Optional"
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
              >
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setAccountSaved(false);
                  }}
                  placeholder="0803 123 4567"
                  className={INPUT_CLASS}
                />
              </Field>
              <SelectField
                id="default_city"
                label="Default city"
                hint="Used when location access is unavailable"
                icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                value={defaultCity}
                onChange={(value) => {
                  setDefaultCity(value);
                  setAccountSaved(false);
                }}
              >
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </SelectField>

              {accountError && <Alert tone="error">{accountError}</Alert>}
              {accountSaved && <Alert tone="success">Your details were saved.</Alert>}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <button type="submit" disabled={accountSaving} className={PRIMARY_BUTTON}>
                  {accountSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {accountSaving ? 'Saving…' : 'Save Account Details'}
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {signingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  )}
                  Sign Out
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sign in to keep your HMO plan and details on every device.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign In / Create Account
              </Link>
            </div>
          )}
        </SettingsSection>

        {/* 4. Legal & privacy */}
        <SettingsSection
          id="legal"
          title="Legal & Privacy"
          description="How MedNet handles your data, and the terms that apply when you use it."
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            <li>
              <LegalRow
                href="/privacy"
                icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                title="Privacy Policy"
                description="What we collect, why, how long we keep it, and how to update or delete it."
              />
            </li>
            <li>
              <LegalRow
                href="/terms"
                icon={<FileText className="h-4 w-4" aria-hidden="true" />}
                title="Terms & Conditions"
                description="What MedNet is and is not, the emergency disclaimer, and how listings should be used."
              />
            </li>
          </ul>
        </SettingsSection>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Sub-components                             */
/* -------------------------------------------------------------------------- */

const INPUT_CLASS =
  'block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950';

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LegalRow({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 group-hover:text-teal-700 dark:text-slate-100 dark:group-hover:text-teal-300">
          {title}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
    </Link>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      {label}
    </div>
  );
}

function Alert({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const classes =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${classes}`}
    >
      {tone === 'error' ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{children}</span>
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

function Field({
  id,
  label,
  hint,
  icon,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  children: ReactNode;
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
        {children}
      </div>
    </div>
  );
}

function SelectField({
  id,
  label,
  icon,
  value,
  onChange,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Field id={id} label={label} hint={hint} icon={icon}>
      <select
        id={id}
        name={id}
        value={value}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} appearance-none pr-10`}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-500">
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </span>
    </Field>
  );
}
