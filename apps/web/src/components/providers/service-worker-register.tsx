"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js for installability + basic app-shell caching —
 * see that file's own comment for exactly what it does and doesn't
 * cover. Fire-and-forget: a registration failure (unsupported browser,
 * blocked by a privacy setting) just means no offline resilience, never
 * a broken app, so there's nothing to surface to the user here.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
