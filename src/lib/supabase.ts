/**
 * Client-side Supabase Utilities
 * 
 * This file provides client-side Supabase client creation.
 * It should only be imported in client components.
 */

import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Environment variable validation helper
const getEnvVariables = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return { supabaseUrl, supabaseAnonKey };
};

// Create a Supabase client with the public API key (for client-side use)
// Note: If you experience WebSocket connection issues, avoid calling removeAllChannels()
// unless you're actually using realtime subscriptions
export const createBrowserSupabaseClient = () => {
  const { supabaseUrl, supabaseAnonKey } = getEnvVariables();

  // Use createBrowserClient from @supabase/ssr instead of createClient directly
  // This prevents multiple GoTrueClient instances in browser context
  if (typeof window !== 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  
  // Fallback for non-browser environments if needed
  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
};

// For backward compatibility
export { createBrowserSupabaseClient as createClient }; 