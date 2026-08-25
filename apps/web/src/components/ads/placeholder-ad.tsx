import { Sparkles } from "lucide-react";
import type { AdSlot } from "@/lib/ads/config";

/**
 * Dev/fallback ad creative. Intentionally looks like an ad (not a fake
 * financial notification or transaction — spec explicitly forbids ads
 * disguised as either) and reserves the exact footprint a real banner
 * will occupy, so switching providers never shifts layout.
 */
export function PlaceholderAd({ slot }: { slot: AdSlot }) {
  return (
    <div
      role="complementary"
      aria-label="Advertisement"
      className="mx-auto flex h-[90px] w-full max-w-[728px] items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-muted px-4 text-xs text-foreground-muted"
      data-ad-slot={slot}
    >
      <Sparkles className="size-3.5" />
      Advertisement — this space supports free Montra
    </div>
  );
}
