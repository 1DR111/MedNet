import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Server Components cannot write cookies, so without this step an expired
 * access token would never be renewed and the user would appear signed out.
 * This runs in the Next.js Proxy layer (formerly Middleware), which *can*
 * write cookies, and forwards any refreshed tokens both to the downstream
 * render (via the request) and to the browser (via the response).
 *
 * No redirects are performed here. Route protection is handled elsewhere.
 */
export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Update the request cookies so the downstream Server Components see
        // the refreshed session on this same request.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        // Recreate the response from the mutated request, then set the cookies
        // on the response so the browser stores the refreshed tokens.
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: do not add logic between createServerClient and getUser().
  // getUser() is what triggers the token refresh; it must be awaited here so
  // that any refreshed cookies are written before the response is returned.
  await supabase.auth.getUser();

  // IMPORTANT: return the `supabaseResponse` object as-is. If you need to
  // build a different response (e.g. a redirect in a later phase), copy the
  // cookies across from `supabaseResponse` first, otherwise the browser and
  // server sessions will fall out of sync.
  return supabaseResponse;
}
