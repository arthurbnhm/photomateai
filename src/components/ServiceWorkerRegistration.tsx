"use client";

import { useEffect } from "react";
import { registerImageCacheWorker, isServiceWorkerActive } from "@/lib/imageCache";

// Add a global ready state
let isReady = false;
let readyCallbacks: (() => void)[] = [];

export function onServiceWorkerReady(callback: () => void) {
  if (isReady) {
    callback();
  } else {
    readyCallbacks.push(callback);
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const register = async () => {
      try {
        // Check if SW is already active
        if (isServiceWorkerActive()) {
          console.log("✅ Service worker is already active");
          isReady = true;
          readyCallbacks.forEach(cb => cb());
          readyCallbacks = [];
          return;
        }

        // Register the service worker
        const success = await registerImageCacheWorker();
        
        if (success) {
          console.log("✅ Image caching service worker registered");
          isReady = true;
          readyCallbacks.forEach(cb => cb());
          readyCallbacks = [];
        } else {
          console.warn("⚠️ Could not register service worker");
          // Still mark as ready to avoid blocking the app
          isReady = true;
          readyCallbacks.forEach(cb => cb());
          readyCallbacks = [];
        }
      } catch (error) {
        console.error("❌ Error registering service worker:", error);
        // Still mark as ready to avoid blocking the app
        isReady = true;
        readyCallbacks.forEach(cb => cb());
        readyCallbacks = [];
      }
    };

    register();
  }, []);

  return null; // This component doesn't render anything
}

export function isServiceWorkerReady() {
  return isReady;
} 