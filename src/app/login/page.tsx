'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { createClient } from '@/lib/supabase/client';
import type { PatientProfile } from '@/types/database';

type AuthMode = 'signin' | 'signup';

type OnboardingStatus = Pick<PatientProfile, 'onboarding_completed'>;

/**
 * `useSearchParams` must sit under a Suspense boundary in a prerendered
 * Client Component, so the page shell delegates to {@link LoginForm}.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Seed from the `error` query param so failures reported by /auth/callback
  // (expired or invalid confirmation links, failed code exchange) are shown.
  const [error, setError] = useState<string | null>(() => searchParams.get('error'));
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

    const { data: profile, error: profileError } = await supabase
      .from('patient_profiles')
      .select('onboarding_completed')
      .eq('id', data.user.id)
      .maybeSingle()
      .overrideTypes<OnboardingStatus, { merge: false }>();

    // The session is already established at this point. If the profile lookup
    // fails, treat it like a missing profile and let onboarding rebuild it
    // rather than stranding a signed-in user on the login form.
    const destination =
      !profileError && profile?.onboarding_completed ? '/' : '/onboarding';
    router.replace(destination);
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
    <div className="flex min-h-screen flex-1 flex-col bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-slate-900">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
              <HeartPulse className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">MedNet</h1>
            <p className="mt-1 text-sm text-slate-600">
              Find trusted hospitals, clinics, pharmacies and labs near you.
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
            {/* Mode toggle */}
            <div
              role="group"
              aria-label="Authentication mode"
              className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium"
            >
              <button
                type="button"
                aria-pressed={!isSignUp}
                onClick={() => switchMode('signin')}
                className={`rounded-lg px-3 py-2 transition-colors ${
                  !isSignUp
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                aria-pressed={isSignUp}
                onClick={() => switchMode('signup')}
                className={`rounded-lg px-3 py-2 transition-colors ${
                  isSignUp
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>

            <h2 className="text-lg font-semibold text-slate-900">
              {isSignUp ? 'Create your patient account' : 'Welcome back'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
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
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
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
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{notice}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <Map className="h-4 w-4" aria-hidden="true" />
              Continue as Guest to Map
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            {isSignUp ? 'Already have an account? ' : 'New to MedNet? '}
            <button
              type="button"
              onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}
              className="font-medium text-emerald-700 underline-offset-2 hover:underline"
            >
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

const inputClass =
  'block w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';

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
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-xs text-slate-400">
            {hint}
          </span>
        )}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
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
    <div className="flex min-h-screen flex-1 flex-col bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-slate-900">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div
          role="status"
          className="flex flex-col items-center gap-3 text-sm text-slate-500"
        >
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" aria-hidden="true" />
          Loading…
        </div>
      </main>
    </div>
  );
}
