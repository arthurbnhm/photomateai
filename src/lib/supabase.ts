import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client with the public API key (for client-side use)
export const createSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  // Use createBrowserClient from @supabase/ssr instead of createClient directly
  // This prevents multiple GoTrueClient instances in browser context
  if (typeof window !== 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  
  // Fallback for non-browser environments if needed
  return createClient(supabaseUrl, supabaseAnonKey);
};

// Create a Supabase client with the service role key (for server-side use)
export const createSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}; 