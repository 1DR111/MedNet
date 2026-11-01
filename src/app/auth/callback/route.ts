import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Supabase auth callback.
 *
 * Supabase redirects here after email confirmation (and, later, OAuth). Two
 * shapes are handled:
 *
 * 1. `?code=...` (PKCE): exchanged with `exchangeCodeForSession`. Only works
 *    in the browser that started the sign-up, because the PKCE verifier lives
 *    in that browser's cookies.
 * 2. `?token_hash=...&type=email` (recommended for email links): verified with
 *    `verifyOtp`, which works from any device. To use it, point the
 *    "Confirm signup" email template at
 *    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/onboarding`.
 *
 * Either way the server client writes the session cookies, then we redirect.
 * Defaults to `/`. An optional `next` query param can override the destination,
 * but only same-origin paths are honoured. Failures redirect to `/login?error=`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = resolveOrigin(request);
  const next = safeNextPath(searchParams.get('next'));

  // Supabase reports expired or invalid links by redirecting with its own
  // error params instead of a code. Surface its message rather than ours.
  const upstreamError = searchParams.get('error_description') ?? searchParams.get('error');
  if (upstreamError) {
    return redirectToLogin(origin, upstreamError);
  }

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = parseEmailOtpType(searchParams.get('type'));

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return redirectToLogin(origin, error.message);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectToLogin(origin, error.message);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  return redirectToLogin(origin, 'Missing authentication code.');
}

function redirectToLogin(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return value && (EMAIL_OTP_TYPES as readonly string[]).includes(value)
    ? (value as EmailOtpType)
    : null;
}

/** Only allow relative, same-origin paths to avoid open redirects. */
function safeNextPath(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  return value;
}

/**
 * Behind a reverse proxy (e.g. Vercel, Nginx) `request.nextUrl.origin` can be
 * the internal host. Prefer the forwarded host when present.
 */
function resolveOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');

  if (forwardedHost) {
    const proto = forwardedProto ?? (process.env.NODE_ENV === 'development' ? 'http' : 'https');
    return `${proto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}
