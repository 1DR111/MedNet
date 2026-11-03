import Link from 'next/link';

const LINK_CLASS =
  'text-xs font-medium text-slate-600 underline-offset-2 transition-colors hover:text-teal-700 hover:underline dark:text-slate-300 dark:hover:text-teal-300';

/** Privacy Policy and Terms & Conditions links for page footers and the drawer. */
export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <Link href="/privacy" className={LINK_CLASS}>
        Privacy Policy
      </Link>
      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
        ·
      </span>
      <Link href="/terms" className={LINK_CLASS}>
        Terms &amp; Conditions
      </Link>
    </nav>
  );
}
