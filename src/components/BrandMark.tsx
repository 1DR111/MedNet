import type { SVGProps } from 'react';

/** The MedNet mark, matching `app/icon.svg`: a white cross on the brand teal. */
export default function BrandMark({ className = 'h-10 w-10', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className} {...props}>
      <rect width="64" height="64" rx="14" fill="#0f766e" />
      <path
        d="M26 14h12v12h12v12H38v12H26V38H14V26h12z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
