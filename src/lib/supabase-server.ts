/**
 * Server-side Supabase Utilities
 * 
 * This file provides server-side Supabase client creation and utilities.
 * It should only be imported in server components or API routes.
 */

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

// Environment variable validation helper
const getEnvVariables = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return { supabaseUrl, supabaseAnonKey };
};

// Create a Supabase client with the service role key (for server-side admin operations)
export const createSupabaseAdmin = () => {
  const { supabaseUrl } = getEnvVariables();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceKey) {
    throw new Error('Missing Supabase service role key');
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
};

// Create a server-side client for use in server components
export const createServerClient = () => {
  const { supabaseUrl, supabaseAnonKey } = getEnvVariables();
  const cookieStore = cookies();
  
  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      async getAll() {
        return (await cookieStore).getAll();
      },
      async setAll(cookiesToSet) {
        try {
          const resolvedCookiesStore = await cookieStore;
          cookiesToSet.forEach(({ name, value, options }) =>
            resolvedCookiesStore.set({ name, value, ...options })
          );
        } catch (error) {
          console.error('Cookie set error in server component:', error);
        }
      },
    },
  });
};

// Create a middleware client for use in Next.js middleware
export const createMiddlewareClient = (request: NextRequest, response: NextResponse) => {
  const { supabaseUrl, supabaseAnonKey } = getEnvVariables();
  
  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value,
          ...options,
        });
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value: '',
          ...options,
        });
        response.cookies.set({
          name,
          value: '',
          ...options,
        });
      },
    },
  });
};

// Update session in middleware
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createMiddlewareClient(request, response);
  await supabase.auth.getUser();

  return response;
}

// For backward compatibility - alias createServerClient as createClient
export { createServerClient as createClient }; 