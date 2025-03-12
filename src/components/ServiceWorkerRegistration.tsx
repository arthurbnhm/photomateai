"use client";

import { useEffect } from "react";
import { registerImageCacheWorker, isServiceWorkerActive } from "@/lib/imageCache";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const register = async () => {
      try {
        // Check if SW is already active
        if (isServiceWorkerActive()) {
          console.log("✅ Service worker is already active");
          return;
        }

        // Register the service worker
        const success = await registerImageCacheWorker();
        
        if (success) {
          console.log("✅ Image caching service worker registered");
        } else {
          console.warn("⚠️ Could not register service worker");
        }
      } catch (error) {
        console.error("❌ Error registering service worker:", error);
      }
    };

    register();
  }, []);

  return null; // This component doesn't render anything
} 