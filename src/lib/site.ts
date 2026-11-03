/** Site-wide facts used by legal pages and footers. */

export const SITE_NAME = 'MedNet';
export const SITE_LOCATION = 'Abuja, Federal Capital Territory, Nigeria';

/** Shown on the Terms and Privacy pages. Update whenever either text changes. */
export const LEGAL_UPDATED = '3 November 2026';

/** Address for privacy requests and support; overridable per environment. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@mednet.ng';
