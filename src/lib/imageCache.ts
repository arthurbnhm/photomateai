// Service worker registration and image cache utility

// Track service worker registration
let swRegistration: ServiceWorkerRegistration | null = null;

// Track in-flight preload requests to avoid duplicates
const inFlightPreloads = new Set<string>();

/**
 * Register the service worker for image caching
 */
export const registerImageCacheWorker = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers are not supported in this browser');
    return false;
  }

  try {
    // Register the service worker
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('🔧 Service Worker registered successfully', swRegistration.scope);
    
    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    console.log('✅ Service Worker is active and ready');
    
    return true;
  } catch (error) {
    console.error('❌ Service Worker registration failed:', error);
    return false;
  }
};

/**
 * Delete an image from the service worker cache
 */
export const deleteImageFromCache = async (imageUrl: string): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    console.warn('Service worker not available or not controlling the page');
    return false;
  }
  
  return new Promise<boolean>((resolve) => {
    // Create one-time message handler for the response
    const messageHandler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'IMAGE_DELETED' && event.data.url === imageUrl) {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
        clearTimeout(timeoutId);
        resolve(event.data.success);
      }
    };
    
    // Listen for the response
    navigator.serviceWorker.addEventListener('message', messageHandler);
    
    // Set a timeout in case we don't get a response - increased to 10 seconds for batch operations
    const timeoutId = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', messageHandler);
      console.warn(`⏱️ Timeout waiting for delete confirmation for: ${imageUrl.substring(0, 50)}...`);
      // Assume success even on timeout to prevent blocking the UI
      resolve(true);
    }, 10000);
    
    // Send the delete request to the controller (it's guaranteed to be non-null here due to the earlier check)
    const controller = navigator.serviceWorker.controller as ServiceWorker;
    controller.postMessage({
      type: 'DELETE_IMAGE',
      url: imageUrl
    });
  });
};

/**
 * Delete multiple images from the service worker cache in a batch
 */
export const deleteImagesFromCache = async (imageUrls: string[]): Promise<boolean> => {
  if (!imageUrls || imageUrls.length === 0) return true;
  
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    console.warn('Service worker not available or not controlling the page');
    return false;
  }
  
  console.log(`🗑️ Batch deleting ${imageUrls.length} images from cache`);
  
  // Process in batches of 5 to avoid overwhelming the service worker
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < imageUrls.length; i += batchSize) {
    batches.push(imageUrls.slice(i, i + batchSize));
  }
  
  // Process each batch sequentially
  for (const batch of batches) {
    await Promise.all(batch.map(url => deleteImageFromCache(url)));
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return true;
};

/**
 * Clear all images from the service worker cache
 */
export const clearImageCache = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    console.warn('Service worker not available or not controlling the page');
    return false;
  }
  
  return new Promise<boolean>((resolve) => {
    // Create one-time message handler for the response
    const messageHandler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CACHE_CLEARED') {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
        clearTimeout(timeoutId);
        resolve(event.data.success);
      }
    };
    
    // Listen for the response
    navigator.serviceWorker.addEventListener('message', messageHandler);
    
    // Set a timeout in case we don't get a response - increased to 15 seconds for clearing the entire cache
    const timeoutId = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', messageHandler);
      console.warn('⏱️ Timeout waiting for cache clear confirmation, but continuing anyway');
      // Assume success even on timeout to prevent blocking the UI
      resolve(true);
    }, 15000);
    
    // Send the clear request to the controller (it's guaranteed to be non-null here due to the earlier check)
    const controller = navigator.serviceWorker.controller as ServiceWorker;
    controller.postMessage({
      type: 'CLEAR_ALL_IMAGES'
    });
  });
};

/**
 * Check if an image is already in the cache
 */
export const isImageCached = async (imageUrl: string): Promise<boolean> => {
  if (!('caches' in window)) {
    return false;
  }
  
  try {
    const cache = await caches.open('photomate-image-cache-v3');
    const response = await cache.match(imageUrl);
    return !!response;
  } catch (error) {
    console.error('Error checking cache:', error);
    return false;
  }
};

/**
 * Warm up the cache with a list of image URLs
 * Improved implementation to prevent duplicate requests
 */
export const preloadImages = (imageUrls: string[]): void => {
  if (!imageUrls || imageUrls.length === 0) return;
  
  // Limit to at most 2 images to avoid excessive preloading
  const limitedUrls = imageUrls.slice(0, 2);
  
  // Filter out URLs that are already being preloaded
  const urlsToCheck = limitedUrls.filter(url => !inFlightPreloads.has(url));
  
  if (urlsToCheck.length === 0) {
    console.log('🔄 All images already being preloaded, skipping');
    return;
  }
  
  // Mark these URLs as in-flight
  urlsToCheck.forEach(url => inFlightPreloads.add(url));
  
  // First check which images are already cached
  Promise.all(urlsToCheck.map(url => isImageCached(url)))
    .then(results => {
      // Only preload images that aren't already cached
      const urlsToPreload = urlsToCheck.filter((url, index) => !results[index]);
      
      if (urlsToPreload.length === 0) {
        console.log('🔵 All images already cached, skipping preload');
        // Clean up in-flight tracking
        urlsToCheck.forEach(url => inFlightPreloads.delete(url));
        return;
      }
      
      console.log('🔄 Preloading images:', urlsToPreload);
      
      // Process each URL sequentially to avoid race conditions
      const preloadSequentially = async () => {
        for (const url of urlsToPreload) {
          if (!url) continue;
          
          try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              // Use the Image API instead of fetch for more reliable preloading
              const img = new Image();
              
              // Create a promise that resolves when the image loads or errors
              await new Promise<void>((resolve) => {
                img.onload = () => {
                  console.log('✅ Image preloaded successfully:', url);
                  resolve();
                };
                
                img.onerror = () => {
                  console.log('⚠️ Image preload failed (can be ignored):', url);
                  resolve();
                };
                
                // Set the src to trigger loading
                img.src = url;
              });
              
              // Wait a bit before the next preload to avoid overwhelming the service worker
              await new Promise(resolve => setTimeout(resolve, 300));
            } else {
              // Fallback to link preload if service worker is not available
              const link = document.createElement('link');
              link.rel = 'preload';
              link.as = 'image';
              link.href = url;
              link.crossOrigin = 'anonymous';
              
              document.head.appendChild(link);
              
              // Remove after a timeout
              setTimeout(() => {
                if (document.head.contains(link)) {
                  document.head.removeChild(link);
                }
              }, 10000);
              
              // Wait a bit before the next preload
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (error) {
            console.error('Error preloading image:', error);
          } finally {
            // Remove from in-flight tracking
            setTimeout(() => {
              inFlightPreloads.delete(url);
            }, 1000);
          }
        }
        
        console.log('✅ Sequential preloading complete for:', urlsToPreload);
      };
      
      // Start the sequential preloading
      preloadSequentially().catch(error => {
        console.error('Error during sequential preloading:', error);
        // Clean up in-flight tracking on error
        urlsToPreload.forEach(url => inFlightPreloads.delete(url));
      });
    })
    .catch(error => {
      console.error('Error during preload check:', error);
      // Clean up in-flight tracking
      urlsToCheck.forEach(url => inFlightPreloads.delete(url));
    });
};

/**
 * Check if the service worker is active and controlling the page
 */
export const isServiceWorkerActive = (): boolean => {
  return !!(
    'serviceWorker' in navigator && 
    navigator.serviceWorker.controller
  );
};

export default {
  registerImageCacheWorker,
  deleteImageFromCache,
  deleteImagesFromCache,
  clearImageCache,
  preloadImages,
  isImageCached,
  isServiceWorkerActive
}; 