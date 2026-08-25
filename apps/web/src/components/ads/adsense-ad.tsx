"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import type { AdSlot } from "@/lib/ads/config";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Real Google AdSense integration, gated entirely behind env config (see
 * lib/ads/config.ts). Never receives budget/transaction/account data — it
 * only ever renders the network's own script against a slot id, keeping
 * the financial engine and advertising completely isolated (spec:
 * Privacy — "Never send financial information to advertising services").
 */
export function AdSenseAd({ slot }: { slot: AdSlot }) {
  const insRef = useRef<HTMLModElement>(null);
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  useEffect(() => {
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // AdSense script not yet loaded or blocked (ad blocker) — fail silently,
      // never let an ad failure affect the budgeting UI around it.
    }
  }, []);

  if (!clientId) return null;

  return (
    <div className="mx-auto flex min-h-[90px] w-full max-w-[728px] items-center justify-center">
      <Script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
        crossOrigin="anonymous"
        strategy="lazyOnload"
      />
      <ins
        ref={insRef}
        className="adsbygoogle block w-full"
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </div>
  );
}
