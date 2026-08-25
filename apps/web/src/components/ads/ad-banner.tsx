"use client";

import { useMe } from "@/hooks/use-me";
import { useHasHydrated } from "@/hooks/use-hydrated";
import { getConfiguredAdProvider, type AdSlot } from "@/lib/ads/config";
import { PlaceholderAd } from "@/components/ads/placeholder-ad";
import { AdSenseAd } from "@/components/ads/adsense-ad";

/**
 * The ONLY place in the app that shows an advertisement. Every screen that
 * wants a banner renders <AdBanner slot="..." /> in one of the approved
 * low-distraction locations (bottom of dashboard/reports/settings/etc) —
 * never inside a transaction row, budget category row, account balance
 * display, or any entry form (spec section 3).
 *
 * Reserves a fixed-height footprint even while resolving entitlement, so
 * there's no layout shift once the answer comes back. Gated on
 * useHasHydrated() (not just isLoading) because a fast /api/auth/me
 * response can resolve before hydration finishes, which would otherwise
 * make the client's first render disagree with the server's loading
 * placeholder.
 */
export function AdBanner({ slot }: { slot: AdSlot }) {
  const { data: me, isLoading } = useMe();
  const hydrated = useHasHydrated();

  if (!hydrated || isLoading) {
    return <div className="h-[90px] w-full" aria-hidden="true" />;
  }
  if (me?.adsRemoved) {
    return null;
  }

  const provider = getConfiguredAdProvider();

  return (
    <div className="w-full border-t border-border bg-surface px-4 py-3">
      {provider === "adsense" ? <AdSenseAd slot={slot} /> : <PlaceholderAd slot={slot} />}
    </div>
  );
}
