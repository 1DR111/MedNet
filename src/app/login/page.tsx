'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import LegalLinks from '@/components/LegalLinks';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartPulse,
  Loader2,
  Lock,
  Mail,
  Map,
  Phone,
  User,
} from 'lucide-react';
import type { SupabaseClient, User as AuthUser } from '@supabase/supabase-js';
import { dismissSplash } from '@/lib/splash';
import { createClient } from '@/lib/supabase/client';

type AuthMode = 'signin' | 'signup';

/** `?mode=signup` opens the Create Account tab; anything else opens Sign In. */
function parseAuthMode(value: string | null): AuthMode {
  return value === 'signup' ? 'signup' : 'signin';
}

/**
 * Creates a default `patient_profiles` row when the signed-in user has none
 * (for example after a database reset), so the dashboard has a profile to
 * read. It never touches an existing row, so a returning patient's saved
 * HMO, plan tier and details are left exactly as they were. Quiet by design:
 * a failure here must never block signing in.
 */
async function ensureProfileRow(supabase: SupabaseClient, user: AuthUser): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from('patient_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (lookupError || existing) return;

  const metadata = user.user_metadata as { full_name?: unknown };
  await supabase.from('patient_profiles').insert({
    id: user.id,
    email: user.email ?? '',
    full_name: typeof metadata.full_name === 'string' ? metadata.full_name : '',
    has_hmo: false,
    default_city: 'Abuja',
    onboarding_completed: true,
  });
}

/**
 * `useSearchParams` must sit under a Suspense boundary in a prerendered
 * Client Component, so the page shell delegates to {@link LoginRoute}.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginRoute />
    </Suspense>
  );
}

/**
 * Reads the query string: `mode` picks the tab (`/login?mode=signup` opens
 * Create Account, `/login?mode=signin` opens Sign In) and `error` carries
 * failures reported by /auth/callback. The form is keyed by the requested
 * mode, so a deep link always opens the tab it names.
 */
function LoginRoute() {
  const searchParams = useSearchParams();
  const requestedMode = parseAuthMode(searchParams.get('mode'));
  return (
    <LoginForm
      key={requestedMode}
      initialMode={requestedMode}
      initialError={searchParams.get('error')}
    />
  );
}

function LoginForm({
  initialMode,
  initialError,
}: {
  initialMode: AuthMode;
  initialError: string | null;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Seeded from the `error` query param so failures reported by /auth/callback
  // (expired or invalid confirmation links, failed code exchange) are shown.
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setNotice(null);
    setShowPassword(false);
  }

  async function handleSignUp() {
    const supabase = createClient();
    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        // Stored as user metadata so the profile can be rebuilt later if the
        // insert below cannot run (e.g. email confirmation is required).
        data: { full_name: trimmedName, phone: trimmedPhone || null },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.user) {
      setError('We could not create your account. Please try again.');
      return;
    }

    // When email confirmation is enabled in Supabase, no session is returned
    // until the user clicks the link in their inbox. Row-level security would
    // block the profile insert in that state, so we stop here and let the
    // onboarding step create the profile once they are signed in.
    if (!data.session) {
      setNotice(
        'Account created. Check your inbox for a confirmation link to finish signing up.',
      );
      return;
    }

    const { error: profileError } = await supabase.from('patient_profiles').upsert(
      {
        id: data.user.id,
        email: trimmedEmail,
        full_name: trimmedName,
        phone: trimmedPhone || null,
        has_hmo: false,
        onboarding_completed: false,
      },
      { onConflict: 'id' },
    );

    if (profileError) {
      setError(`Your account was created but we could not save your profile: ${profileError.message}`);
      return;
    }

    router.replace('/onboarding');
    router.refresh();
  }

  async function handleSignIn() {
    const supabase = createClient();
    const trimmedEmail = email.trim().toLowerCase();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : signInError.message,
      );
      return;
    }

    // Signing in always lands on the map. Onboarding is only for brand-new
    // accounts; existing coverage is never touched here.
    await ensureProfileRow(supabase, data.user);

    router.replace('/');
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (isSignUp && fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await handleSignUp();
      } else {
        await handleSignIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
              <HeartPulse className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">MedNet</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Find trusted hospitals, clinics, pharmacies, labs and specialist care near you.
            </p>
          </div>

          {/* Card */}
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30 sm:p-8">
            {/* Mode toggle */}
            <div
              role="group"
              aria-label="Authentication mode"
              className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium dark:bg-slate-800"
            >
              <button
                type="button"
                aria-pressed={!isSignUp}
                onClick={() => switchMode('signin')}
                className={`rounded-md px-3 py-2 transition-colors ${
                  !isSignUp
                    ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                aria-pressed={isSignUp}
                onClick={() => switchMode('signup')}
                className={`rounded-md px-3 py-2 transition-colors ${
                  isSignUp
                    ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                }`}
              >
                Create Account
              </button>
            </div>

            <h2 className="text-lg font-semibold">
              {isSignUp ? 'Create your patient account' : 'Welcome back'}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {isSignUp
                ? 'Save your HMO details and get personalised facility matches.'
                : 'Sign in to see facilities that accept your HMO plan.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {isSignUp && (
                <>
                  <Field
                    id="full_name"
                    label="Full name"
                    icon={<User className="h-4 w-4" aria-hidden="true" />}
                  >
                    <input
                      id="full_name"
                      name="full_name"
                      type="text"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Adaeze Okafor"
                      className={inputClass}
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
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      aria-describedby="phone-hint"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0803 123 4567"
                      className={inputClass}
                    />
                  </Field>
                </>
              )}

              <Field
                id="email"
                label="Email address"
                icon={<Mail className="h-4 w-4" aria-hidden="true" />}
              >
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </Field>

              <Field
                id="password"
                label="Password"
                hint={isSignUp ? 'At least 6 characters' : undefined}
                icon={<Lock className="h-4 w-4" aria-hidden="true" />}
              >
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  aria-describedby={isSignUp ? 'password-hint' : undefined}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </Field>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{notice}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isSubmitting
                  ? isSignUp
                    ? 'Creating account…'
                    : 'Signing in…'
                  : isSignUp
                    ? 'Create account'
                    : 'Sign in'}
              </button>

              {isSignUp && (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  By creating an account you agree to the{' '}
                  <Link
                    href="/terms"
                    className="font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
                  >
                    Terms &amp; Conditions
                  </Link>{' '}
                  and{' '}
                  <Link
                    href="/privacy"
                    className="font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              )}
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              or
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            {/* Guests who choose the map here should not meet the welcome screen again this session. */}
            <Link
              href="/"
              onClick={dismissSplash}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-200 dark:focus-visible:ring-offset-slate-900"
            >
              <Map className="h-4 w-4" aria-hidden="true" />
              Continue as Guest to Map
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {isSignUp ? 'Already have an account? ' : 'New to MedNet? '}
            <button
              type="button"
              onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
            >
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <LegalLinks className="mt-5 justify-center" />
        </div>
      </main>
    </div>
  );
}

const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 md:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

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
  icon: React.ReactNode;
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
        {children}
      </div>
    </div>
  );
}

/** Static shell shown while the search-params-aware form is suspended. */
function LoginShell() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div
          role="status"
          className="flex flex-col items-center gap-3 text-sm text-slate-500 dark:text-slate-400"
        >
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Loading…
        </div>
      </main>
    </div>
  );
}
