import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client for use on the server: Server Components,
 * Server Functions (actions) and Route Handlers.
 *
 * A new client is created per request so that it reads the current user's
 * session from the incoming request cookies. `cookies()` is asynchronous in
 * this version of Next.js, so this function must be awaited.
 *
 * Calling `cookies()` opts the route into dynamic rendering.
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `set` throws when called from a Server Component because cookies
          // cannot be written after the response has started streaming. This
          // is safe to ignore if middleware refreshes the user's session;
          // writes still succeed from Server Functions and Route Handlers.
        }
      },
    },
  });
}
