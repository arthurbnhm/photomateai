// Simple cache utilities for auth data with TTL support

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

type CacheKey = string;

export class SimpleCache {
  // Cache durations in milliseconds
  static readonly DURATIONS = {
    USER: 5 * 60 * 1000,      // 5 minutes (rarely changes)
    SUBSCRIPTION: 5 * 60 * 1000, // 5 minutes (rarely changes)
    CREDITS: 1 * 60 * 1000,    // 1 minute (changes often)
    MODELS: 10 * 60 * 1000,    // 10 minutes (rarely changes)
  } as const;

  // Cache keys
  static readonly KEYS = {
    AUTH_USER: 'photomate_auth_user',
    SUBSCRIPTION: 'photomate_subscription',
    CREDITS: 'photomate_credits',
  } as const;

  /**
   * Get data from cache (checks both memory and localStorage)
   */
  static get<T>(key: CacheKey): T | null {
    try {
      // Try localStorage first
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.invalidate(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.warn(`Cache get error for key ${key}:`, error);
      this.invalidate(key);
      return null;
    }
  }

  /**
   * Set data in cache with TTL
   */
  static set<T>(key: CacheKey, data: T, ttl: number): void {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl,
      };

      localStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.warn(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Check if cache entry is stale (within TTL but old enough to refresh in background)
   */
  static isStale(key: CacheKey, staleThreshold: number = 30 * 1000): boolean {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return true;

      const entry: CacheEntry<unknown> = JSON.parse(cached);
      const age = Date.now() - entry.timestamp;
      
      return age > staleThreshold;
    } catch {
      return true;
    }
  }

  /**
   * Remove specific cache entry
   */
  static invalidate(key: CacheKey): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Cache invalidate error for key ${key}:`, error);
    }
  }

  /**
   * Clear all cache entries
   */
  static clear(): void {
    try {
      Object.values(this.KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  }

  /**
   * Get cached data or execute fetcher function
   */
  static async getOrFetch<T>(
    key: CacheKey,
    fetcher: () => Promise<T>,
    ttl: number,
    useStaleWhileRevalidate: boolean = false
  ): Promise<T> {
    const cached = this.get<T>(key);
    
    if (cached && !useStaleWhileRevalidate) {
      return cached;
    }

    if (cached && useStaleWhileRevalidate && !this.isStale(key)) {
      return cached;
    }

    // Fetch fresh data
    const fresh = await fetcher();
    this.set(key, fresh, ttl);

    return fresh;
  }
} 