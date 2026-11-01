import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in the browser (Client Components).
 *
 * Reads the public URL and anon key from environment variables. Both are safe
 * to expose to the browser; row-level security on the database is what
 * protects patient data, not the key.
 *
 * `createBrowserClient` memoises the instance per page, so calling this
 * function repeatedly is cheap.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
