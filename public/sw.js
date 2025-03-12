const CACHE_NAME = 'photomate-image-cache-v3';

// URLs we want to cache (Supabase image URLs)
const CACHE_PATTERNS = [
  /\.supabase\.co\/storage\/v1\/object\/sign\/images\//,
];

// Install event - precache important assets
self.addEventListener('install', () => {
  // Skip the 'waiting' state and activate immediately
  self.skipWaiting();
  
  // We don't need to precache anything, as images will be cached on-demand
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Clean up old caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Helper function to check if a URL matches our cache patterns
const shouldCache = (url) => {
  return CACHE_PATTERNS.some(pattern => pattern.test(url));
};

// Helper to create a response with cache-control headers
const createCacheableResponse = (originalResponse) => {
  // Clone the response to avoid consuming the body
  const clonedResponse = originalResponse.clone();
  
  // Extract all the headers
  const newHeaders = new Headers();
  clonedResponse.headers.forEach((value, key) => {
    newHeaders.append(key, value);
  });
  
  // Add our cache control headers
  newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
  newHeaders.set('X-Photomate-Cached', 'true');
  newHeaders.set('X-Cache-Date', new Date().toISOString());
  
  // Create a new response with the cloned body and modified headers
  return new Response(clonedResponse.body, {
    status: clonedResponse.status,
    statusText: clonedResponse.statusText,
    headers: newHeaders
  });
};

// Keep track of in-flight requests to avoid duplicates
const inFlightRequests = new Map();

// Fetch event - serve from cache or network with improved caching
self.addEventListener('fetch', (event) => {
  // Only care about GET requests for images that match our patterns
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  
  // Check if this request matches our patterns for caching
  if (!shouldCache(url)) return;
  
  // Check if we already have an in-flight request for this URL
  if (inFlightRequests.has(url)) {
    console.log('🔄 Reusing in-flight request for:', url);
    event.respondWith(inFlightRequests.get(url));
    return;
  }
  
  // Handle the request with our cache-first strategy
  const responsePromise = caches.open(CACHE_NAME).then(async (cache) => {
    try {
      // Try to find in cache first
      const cachedResponse = await cache.match(event.request);
      
      if (cachedResponse) {
        // Check if the cached response has our custom header
        if (cachedResponse.headers.get('X-Photomate-Cached') === 'true') {
          console.log('🔵 Serving from cache (with headers):', url);
          return cachedResponse;
        }
        
        // If it doesn't have our header, it's an old cached response
        // Return it but also update the cache in the background
        console.log('🟡 Serving from cache (updating):', url);
        
        // Update cache in background
        fetch(event.request.clone())
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              // Create a cacheable response and store it
              const cacheableResponse = createCacheableResponse(networkResponse);
              cache.put(event.request, cacheableResponse);
              console.log('🔄 Updated cache in background:', url);
            }
          })
          .catch(err => console.warn('Background fetch failed:', err));
        
        return cachedResponse;
      }
      
      // Not in cache, fetch from network
      console.log('🟢 Fetching from network:', url);
      const networkResponse = await fetch(event.request.clone());
      
      // Don't cache failed responses
      if (!networkResponse || networkResponse.status !== 200) {
        return networkResponse;
      }
      
      // Create a response with cache headers
      const cacheableResponse = createCacheableResponse(networkResponse);
      
      // Log cache miss for debugging
      console.log('🟢 Caching new image:', url);
      
      // Add to cache - use a clone to avoid consuming the body
      cache.put(event.request, cacheableResponse.clone());
      
      return cacheableResponse;
    } catch (error) {
      console.error('❌ Fetch error:', error, url);
      throw error;
    } finally {
      // Remove from in-flight requests after a short delay
      setTimeout(() => {
        inFlightRequests.delete(url);
      }, 1000);
    }
  });
  
  // Store the promise in the in-flight requests map
  inFlightRequests.set(url, responsePromise);
  
  // Respond with the promise
  event.respondWith(responsePromise);
});

// Listen for message to delete a specific image from cache
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'DELETE_IMAGE') {
    const imageUrl = event.data.url;
    
    if (!imageUrl) return;
    
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        // Create a Request object to delete from cache
        return cache.delete(new Request(imageUrl)).then((success) => {
          console.log(`🗑️ Image deleted from cache: ${imageUrl.substring(0, 50)}...`, success ? 'success' : 'not found');
          
          // Send confirmation back to client immediately
          if (event.source && event.source.postMessage) {
            event.source.postMessage({
              type: 'IMAGE_DELETED',
              url: imageUrl,
              success: true // Always report success to avoid blocking the UI
            });
          }
        }).catch(error => {
          console.error('Error deleting image from cache:', error);
          
          // Send confirmation back even on error
          if (event.source && event.source.postMessage) {
            event.source.postMessage({
              type: 'IMAGE_DELETED',
              url: imageUrl,
              success: true // Always report success to avoid blocking the UI
            });
          }
        });
      })
    );
  } else if (event.data && event.data.type === 'CLEAR_ALL_IMAGES') {
    // Clear the entire image cache
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.keys().then((requests) => {
          console.log(`🧹 Clearing ${requests.length} images from cache`);
          return Promise.all(
            requests.map((request) => {
              return cache.delete(request);
            })
          );
        });
      }).then(() => {
        console.log('🧹 Image cache cleared');
        
        // Send confirmation back to client
        if (event.source && event.source.postMessage) {
          event.source.postMessage({
            type: 'CACHE_CLEARED',
            success: true
          });
        }
      }).catch(error => {
        console.error('Error clearing cache:', error);
        
        // Send confirmation back even on error
        if (event.source && event.source.postMessage) {
          event.source.postMessage({
            type: 'CACHE_CLEARED',
            success: true // Always report success to avoid blocking the UI
          });
        }
      })
    );
  }
}); 