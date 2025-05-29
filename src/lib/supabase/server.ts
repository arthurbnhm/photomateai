import { createServerClient as _createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';

export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();

  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, {
              ...options,
              // Ensure proper cookie settings for production
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              httpOnly: false, // Allow client-side access for auth
            });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            console.warn('Cookie set failed in server component:', error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', { 
              ...options, 
              maxAge: 0,
              expires: new Date(0),
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
            });
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
            console.warn('Cookie remove failed in server component:', error);
          }
        },
      },
      auth: {
        // Add better session handling
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    }
  );
});

export const createSupabaseAdminClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase URL or Service Role Key for admin client. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}; 