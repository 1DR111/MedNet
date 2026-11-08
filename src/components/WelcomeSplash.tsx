'use client';

import Link from 'next/link';
import { Building2, LogIn, Map, Navigation, ShieldCheck, UserPlus } from 'lucide-react';
import BrandMark from '@/components/BrandMark';

/**
 * First-visit welcome screen for guests: what MedNet does, in plain terms,
 * and the three ways in. Signed-in patients never see it, and "Browse Map as
 * Guest" hides it for the rest of the tab session (see `lib/splash.ts`).
 */
export interface WelcomeSplashProps {
  onBrowseAsGuest: () => void;
}

const VALUE_POINTS = [
  {
    icon: ShieldCheck,
    title: 'HMO plan tier matching',
    text: 'See which facilities accept your HMO and your exact plan tier before you set out.',
  },
  {
    icon: Building2,
    title: 'Verified Abuja facilities',
    text: 'Hospitals, clinics, pharmacies, labs, dental and eye clinics and specialist centres with listed hours, services and contact details. Verified listings are marked.',
  },
  {
    icon: Navigation,
    title: 'Instant routing',
    text: 'Road directions with distance and drive time inside MedNet, or open the facility in Google Maps.',
  },
] as const;

const PRIMARY =
  'flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900';
const SECONDARY =
  'flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-200 dark:focus-visible:ring-offset-slate-900';
const TERTIARY =
  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100';

export default function WelcomeSplash({ onBrowseAsGuest }: WelcomeSplashProps) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900 supports-[height:100dvh]:min-h-dvh dark:bg-slate-950 dark:text-slate-100">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section
          aria-labelledby="welcome-title"
          className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30 sm:p-8"
        >
          <header className="flex items-center gap-3">
            <BrandMark className="h-11 w-11 shrink-0" />
            <div>
              <p className="text-lg font-semibold tracking-tight">MedNet Abuja</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Healthcare facility and HMO directory
              </p>
            </div>
          </header>

          <h1
            id="welcome-title"
            className="mt-6 text-2xl font-semibold leading-snug tracking-tight sm:text-[1.75rem]"
          >
            Find hospitals, clinics, pharmacies, labs and specialist care in Abuja that accept your HMO.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Search healthcare facilities across Abuja, filter by your exact HMO plan tier,
            and get directions.
          </p>

          <ul className="mt-6 space-y-3">
            {VALUE_POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/30">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-slate-600 dark:text-slate-300">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            <Link href="/login?mode=signup" className={PRIMARY}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Create Account
            </Link>
            <Link href="/login?mode=signin" className={SECONDARY}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign In
            </Link>
          </div>
          <button type="button" onClick={onBrowseAsGuest} className={`${TERTIARY} mt-2`}>
            <Map className="h-4 w-4" aria-hidden="true" />
            Browse Map as Guest
          </button>
        </section>
      </main>
    </div>
  );
}
