import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, HeartPulse } from 'lucide-react';
import { LEGAL_UPDATED, SITE_LOCATION, SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

/**
 * Shared frame for the Terms and Privacy pages: brand header with a
 * "Back to Map" link, title, last-updated date, sections and a footer.
 * Server Component; the pages that use it carry their own metadata.
 */
export default function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  /** One or two plain sentences shown under the title. */
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-700 text-white">
              <HeartPulse className="h-4 w-4" aria-hidden="true" />
            </span>
            {SITE_NAME}
          </Link>
          <BackToMap />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last updated: {LEGAL_UPDATED}</p>
        <p className="mt-4 text-base leading-relaxed text-slate-700 dark:text-slate-300">{summary}</p>
        <div className="mt-8 space-y-8">{children}</div>
        <p className="mt-10">
          <BackToMap primary />
        </p>
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl px-4 py-4 text-xs text-slate-500 sm:px-6 dark:text-slate-400">
          {SITE_NAME} · {SITE_LOCATION}
        </div>
      </footer>
    </div>
  );
}

function BackToMap({ primary = false }: { primary?: boolean }) {
  return (
    <Link
      href="/"
      className={
        primary
          ? 'inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:bg-teal-600 dark:hover:bg-teal-500 dark:focus-visible:ring-offset-slate-950'
          : 'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
      }
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to Map
    </Link>
  );
}

/** A numbered section with a heading and body copy. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 [&_a]:font-medium [&_a]:text-teal-700 [&_a]:underline-offset-2 [&_a:hover]:underline dark:[&_a]:text-teal-300 [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Contact line with the support address as a mailto link. */
export function LegalContact() {
  return (
    <p>
      For questions, data requests or account deletion, email{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  );
}
