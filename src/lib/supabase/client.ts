import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase URL or Anon Key for browser client. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: {
          getItem: (key: string) => {
            if (typeof window === 'undefined') return null;
            try {
              return window.localStorage.getItem(key);
            } catch {
              return null;
            }
          },
          setItem: (key: string, value: string) => {
            if (typeof window === 'undefined') return;
            try {
              window.localStorage.setItem(key, value);
            } catch (error) {
              console.warn('Failed to set localStorage item:', error);
            }
          },
          removeItem: (key: string) => {
            if (typeof window === 'undefined') return;
            try {
              window.localStorage.removeItem(key);
            } catch (error) {
              console.warn('Failed to remove localStorage item:', error);
            }
          },
        },
      },
      global: {
        headers: {
          'X-Client-Info': 'photomate-web'
        }
      }
    }
  );
} 